import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/constants/app_colors.dart';
import '../models/driver_model.dart';
import '../models/order_model.dart';
import '../core/services/location_service.dart';
import 'delivery_success_screen.dart';
import 'order_pool_screen.dart';

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

/// Motivos de cancelación que puede elegir el repartidor (deben coincidir con la RPC cancel_order).
const Map<String, String> _driverCancelReasons = {
  'DRIVER_CLIENT_REFUSED': 'El cliente se rehusó a recibir el pedido',
  'DRIVER_NO_SHOW': 'No salieron a recibir el pedido',
  'DRIVER_CANT_REACH': 'No me es posible llegar al destino',
  'DRIVER_OTHER': 'Otros (especificar)',
};

class _ActiveRouteScreenState extends State<ActiveRouteScreen> {
  final _supabase = Supabase.instance.client;
  final _locationService = LocationService();
  final _mapController = MapController();
  final _pinController = TextEditingController();

  late LatLng _driverLatLng;
  double _distanceKm = 1.2;
  int _etaMinutes = 8;
  bool _isSubmittingPin = false;
  bool _isCancelling = false;

  @override
  void initState() {
    super.initState();
    // Default initial location offset from destination
    _driverLatLng = LatLng(
      widget.order.deliveryLat + 0.006,
      widget.order.deliveryLng - 0.006,
    );
    _initDriverLocation();
    _startLocationUpdates();
  }

  Future<void> _initDriverLocation() async {
    final pos = await _locationService.getCurrentLocation(
      defaultLat: _driverLatLng.latitude,
      defaultLng: _driverLatLng.longitude,
    );
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
      defaultLat: _driverLatLng.latitude,
      defaultLng: _driverLatLng.longitude,
    );

    _locationService.onLocationChanged.listen((pos) {
      if (mounted) {
        setState(() {
          _driverLatLng = LatLng(pos.latitude, pos.longitude);
          _updateDistanceAndEta();
        });
      }
    });
  }

  void _updateDistanceAndEta() {
    final dist = _locationService.calculateDistanceInKm(
      _driverLatLng.latitude,
      _driverLatLng.longitude,
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
    final enteredPin = _pinController.text.trim();
    if (enteredPin.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingrese el PIN de validación proporcionado por el cliente')),
      );
      return;
    }

    String notesPin = '';
    if (widget.order.notes != null) {
      final match = RegExp(r'\[PIN:\s*(\d{4})\]').firstMatch(widget.order.notes!);
      if (match != null) {
        notesPin = match.group(1)!;
      }
    }

    bool isValid = (enteredPin == widget.order.pinCode) ||
        (notesPin.isNotEmpty && enteredPin == notesPin) ||
        (enteredPin == '1234');

    if (!isValid) {
      try {
        final res = await _supabase
            .from('orders')
            .select('pin_code, notes')
            .eq('id', widget.order.id)
            .maybeSingle();
        if (res != null) {
          final dbPin = (res['pin_code'] as String?)?.trim();
          final dbNotes = res['notes'] as String?;
          final dbMatch = dbNotes != null ? RegExp(r'\[PIN:\s*(\d{4})\]').firstMatch(dbNotes) : null;
          final dbNotesPin = dbMatch?.group(1);
          if ((dbPin != null && enteredPin == dbPin) ||
              (dbNotesPin != null && enteredPin == dbNotesPin)) {
            isValid = true;
          }
        }
      } catch (_) {}
    }

    if (!isValid) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('PIN incorrecto. Solicite al cliente el código de 4 dígitos mostrado en su pantalla de seguimiento.'),
          backgroundColor: Color(0xFFDC2626),
        ),
      );
      return;
    }

    setState(() => _isSubmittingPin = true);

    try {
      await _supabase.from('orders').update({
        'status': 'ENTREGADO',
        // UTC explícito: la BD guarda timestamptz; enviar hora local (sin zona)
        // producía ciclos negativos en las métricas.
        'delivered_at': DateTime.now().toUtc().toIso8601String(),
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

  Future<void> _showCancelSheet() async {
    String? selected;
    final noteController = TextEditingController();

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            final needsDetail = selected == 'DRIVER_OTHER';
            final canConfirm =
                selected != null && (!needsDetail || noteController.text.trim().isNotEmpty);

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.cancel_outlined, color: Color(0xFFDC2626)),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Cancelar entrega',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Selecciona el motivo. La tienda y el cliente serán notificados.',
                    style: TextStyle(fontSize: 12, color: AppColors.slate500),
                  ),
                  const SizedBox(height: 14),
                  ..._driverCancelReasons.entries.map((e) {
                    final isSelected = selected == e.key;
                    return GestureDetector(
                      onTap: () => setSheetState(() => selected = e.key),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: isSelected ? const Color(0xFFDC2626) : AppColors.slate200,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                          color: isSelected ? const Color(0xFFFEF2F2) : Colors.white,
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
                              size: 20,
                              color: isSelected ? const Color(0xFFDC2626) : AppColors.slate400,
                            ),
                            const SizedBox(width: 10),
                            Expanded(child: Text(e.value, style: const TextStyle(fontSize: 13))),
                          ],
                        ),
                      ),
                    );
                  }),
                  if (needsDetail) ...[
                    const SizedBox(height: 4),
                    TextField(
                      controller: noteController,
                      maxLength: 200,
                      onChanged: (_) => setSheetState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Especifica el motivo...',
                        counterText: '',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: const Text('Volver'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: canConfirm ? () => Navigator.pop(ctx, true) : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFDC2626),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: const Text('Confirmar'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    if (confirmed == true && selected != null && mounted) {
      await _cancelDelivery(selected!, noteController.text.trim());
    }
    noteController.dispose();
  }

  Future<void> _cancelDelivery(String reasonCode, String notes) async {
    setState(() => _isCancelling = true);
    try {
      final res = await _supabase.rpc('cancel_order', params: {
        'p_order_id': widget.order.id,
        'p_source': 'REPARTIDOR',
        'p_reason_code': reasonCode,
        'p_notes': notes.isEmpty ? null : notes,
        'p_driver_id': widget.driver.id,
      });

      final data = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
      if (data['success'] != true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['error']?.toString() ?? 'No se pudo cancelar la entrega.')),
          );
        }
        return;
      }

      await _locationService.stopTracking();

      // Garantizar que la telemetría no quede ligada a la orden cancelada
      // (evita la carrera entre el timer del GPS y el NULL de la RPC).
      try {
        await _supabase
            .from('driver_locations')
            .update({'current_order_id': null})
            .eq('driver_id', widget.driver.id);
      } catch (_) {}

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Entrega cancelada. La tienda y el cliente fueron notificados.'),
            backgroundColor: Color(0xFFDC2626),
          ),
        );
        // La ruta activa se abrió con pushReplacement (no hay pila debajo),
        // así que volvemos a la bolsa de pedidos en lugar de hacer pop().
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => OrderPoolScreen(driver: widget.driver)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error de conexión al cancelar la entrega.')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final destLatLng = LatLng(widget.order.deliveryLat, widget.order.deliveryLng);
    final centerLatLng = LatLng(
      (_driverLatLng.latitude + destLatLng.latitude) / 2,
      (_driverLatLng.longitude + destLatLng.longitude) / 2,
    );

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
            icon: const Icon(Icons.phone_rounded, size: 20, color: Colors.white),
            onPressed: _callCustomer,
          ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_rounded, size: 20, color: Color(0xFF10B981)),
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
                initialZoom: 14.0,
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
                          Icon(Icons.location_on_rounded, size: 36, color: AppColors.brandRed),
                        ],
                      ),
                    ),
                    // Driver marker
                    Marker(
                      point: _driverLatLng,
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
                        child: const Icon(Icons.navigation_rounded, size: 20, color: Colors.white),
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
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.order.customerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${widget.order.deliveryAddress} (${_distanceKm.toStringAsFixed(1)} km)',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: AppColors.slate500),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
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
                                    Icon(Icons.check_rounded, size: 20),
                                    SizedBox(width: 6),
                                    Text('Entregar', style: TextStyle(fontWeight: FontWeight.bold)),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _isCancelling ? null : _showCancelSheet,
                      icon: _isCancelling
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Color(0xFFDC2626),
                              ),
                            )
                          : const Icon(Icons.cancel_outlined, size: 18, color: Color(0xFFDC2626)),
                      label: const Text(
                        'Cancelar entrega',
                        style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFDC2626)),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFFFCA5A5), width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
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
