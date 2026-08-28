import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/constants/app_colors.dart';
import '../models/driver_model.dart';
import '../models/order_model.dart';
import '../core/services/location_service.dart';
import 'delivery_success_screen.dart';

class ActiveRouteScreen extends StatefulWidget {
  final DriverModel driver;
  final OrderModel order;
  final String restaurantName;

  const ActiveRouteScreen({
    super.key,
    required this.driver,
    required this.order,
    required this.restaurantName,
  });

  @override
  State<ActiveRouteScreen> createState() => _ActiveRouteScreenState();
}

class _ActiveRouteScreenState extends State<ActiveRouteScreen> {
  final _supabase = Supabase.instance.client;
  final _locationService = LocationService();
  final _mapController = MapController();
  final _pinController = TextEditingController();

  LatLng? _driverLatLng;
  double _distanceKm = 0.0;
  int _etaMinutes = 15;
  bool _isSubmittingPin = false;

  @override
  void initState() {
    super.initState();
    _initDriverLocation();
    _startLocationUpdates();
  }

  Future<void> _initDriverLocation() async {
    final pos = await _locationService.getCurrentLocation();
    if (pos != null && mounted) {
      setState(() {
        _driverLatLng = LatLng(pos.latitude, pos.longitude);
        _updateDistanceAndEta();
      });
    }
  }

  void _startLocationUpdates() {
    _locationService.startTracking(
      driverId: widget.driver.id,
      restaurantId: widget.driver.restaurantId,
      currentOrderId: widget.order.id,
    );

    // Periodic check
    Stream.periodic(const Duration(seconds: 4)).listen((_) {
      final pos = _locationService.currentPosition;
      if (pos != null && mounted) {
        setState(() {
          _driverLatLng = LatLng(pos.latitude, pos.longitude);
          _updateDistanceAndEta();
        });
      }
    });
  }

  void _updateDistanceAndEta() {
    if (_driverLatLng == null) return;
    final dist = _locationService.calculateDistanceInKm(
      _driverLatLng!.latitude,
      _driverLatLng!.longitude,
      widget.order.deliveryLat,
      widget.order.deliveryLng,
    );
    final eta = _locationService.estimateMinutes(dist);
    setState(() {
      _distanceKm = dist;
      _etaMinutes = eta;
    });
  }

  Future<void> _callCustomer() async {
    final phone = widget.order.customerPhone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _whatsappCustomer() async {
    final phone = widget.order.customerPhone.replaceAll(RegExp(r'\D'), '');
    final msg = Uri.encodeComponent(
      'Hola ${widget.order.customerName}, soy ${widget.driver.name} tu repartidor de ${widget.restaurantName}. Estoy en camino con tu pedido.',
    );
    final uri = Uri.parse('https://wa.me/51$phone?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _confirmDelivery() async {
    final pin = _pinController.text.trim();
    if (pin.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingrese el PIN de validación proporcionado por el cliente')),
      );
      return;
    }

    setState(() => _isSubmittingPin = true);

    try {
      await _supabase.from('orders').update({
        'status': 'ENTREGADO',
        'delivered_at': DateTime.now().toIso8601String(),
      }).eq('id', widget.order.id);

      await _locationService.stopTracking();

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => DeliverySuccessScreen(
              driver: widget.driver,
              order: widget.order,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al confirmar la entrega. Verifique su conexión.')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmittingPin = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final destLatLng = LatLng(widget.order.deliveryLat, widget.order.deliveryLng);
    final centerLatLng = _driverLatLng ?? destLatLng;

    return Scaffold(
      backgroundColor: AppColors.slate900,
      appBar: AppBar(
        backgroundColor: AppColors.saas900,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'En Ruta: #ORD-${widget.order.orderNumber}',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            Text(
              'Cliente: ${widget.order.customerName}',
              style: const TextStyle(fontSize: 11, color: Color(0xFFA5B4FC)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.phone, size: 20, color: Colors.white),
            onPressed: _callCustomer,
          ),
          IconButton(
            icon: const Icon(LucideIcons.messageSquare, size: 20, color: Color(0xFF10B981)),
            onPressed: _whatsappCustomer,
          ),
        ],
      ),
      body: Column(
        children: [
          // Map
          Expanded(
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: centerLatLng,
                initialZoom: 14.5,
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.deliverysaas.mobile_driver',
                ),
                MarkerLayer(
                  markers: [
                    // Destination marker
                    Marker(
                      point: destLatLng,
                      width: 48,
                      height: 48,
                      child: const Column(
                        children: [
                          Icon(LucideIcons.mapPin, size: 36, color: AppColors.brandRed),
                        ],
                      ),
                    ),
                    // Driver marker
                    if (_driverLatLng != null)
                      Marker(
                        point: _driverLatLng!,
                        width: 44,
                        height: 44,
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppColors.saas600,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.3),
                                blurRadius: 8,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: const Icon(LucideIcons.navigation, size: 20, color: Colors.white),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Bottom Control Panel
          Container(
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black12,
                  blurRadius: 15,
                  offset: Offset(0, -4),
                ),
              ],
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.order.customerName,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                              color: AppColors.slate900,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${widget.order.deliveryAddress} (${_distanceKm.toStringAsFixed(1)} km)',
                            style: const TextStyle(fontSize: 13, color: AppColors.slate500),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.saas50,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.slate200),
                        ),
                        child: Column(
                          children: [
                            const Text('ETA', style: TextStyle(fontSize: 10, color: AppColors.slate400, fontWeight: FontWeight.bold)),
                            Text(
                              '$_etaMinutes min',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.saas600),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),

                  // PIN Section
                  const Text(
                    'VALIDACIÓN DE ENTREGA CON PIN',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                      color: AppColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _pinController,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 6),
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: 'PIN',
                            contentPadding: const EdgeInsets.symmetric(vertical: 12),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: AppColors.slate300, width: 1.5),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: AppColors.saas600, width: 2),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _isSubmittingPin ? null : _confirmDelivery,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF059669),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 0,
                          ),
                          child: _isSubmittingPin
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Row(
                                  children: [
                                    Icon(LucideIcons.check, size: 20),
                                    SizedBox(width: 6),
                                    Text('Entregar', style: TextStyle(fontWeight: FontWeight.bold)),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
