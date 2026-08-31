import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants/app_colors.dart';
import '../models/driver_model.dart';
import '../models/order_model.dart';
import '../core/services/location_service.dart';
import 'active_route_screen.dart';
import 'login_screen.dart';

class OrderPoolScreen extends StatefulWidget {
  final DriverModel driver;

  const OrderPoolScreen({super.key, required this.driver});

  @override
  State<OrderPoolScreen> createState() => _OrderPoolScreenState();
}

class _OrderPoolScreenState extends State<OrderPoolScreen> {
  final _supabase = Supabase.instance.client;
  List<OrderModel> _availableOrders = [];
  bool _isLoading = true;
  String? _restaurantName;
  RealtimeChannel? _ordersChannel;

  @override
  void initState() {
    super.initState();
    _loadRestaurantInfo();
    _checkActiveOrder();
    _loadPoolOrders();
    _subscribeToOrders();
  }

  @override
  void dispose() {
    if (_ordersChannel != null) {
      _supabase.removeChannel(_ordersChannel!);
    }
    super.dispose();
  }

  Future<void> _loadRestaurantInfo() async {
    try {
      final res = await _supabase
          .from('restaurants')
          .select('name')
          .eq('id', widget.driver.restaurantId)
          .single();
      if (mounted) {
        setState(() {
          _restaurantName = res['name'] as String?;
        });
      }
    } catch (_) {}
  }

  Future<void> _checkActiveOrder() async {
    try {
      final res = await _supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('driver_id', widget.driver.id)
          .eq('status', 'EN_CAMINO')
          .limit(1)
          .maybeSingle();

      if (res != null && mounted) {
        final activeOrder = OrderModel.fromJson(res);
        LocationService().startTracking(
          driverId: widget.driver.id,
          restaurantId: widget.driver.restaurantId,
          currentOrderId: activeOrder.id,
        );
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => ActiveRouteScreen(
              driver: widget.driver,
              order: activeOrder,
              restaurantName: _restaurantName ?? 'Restaurante',
            ),
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _loadPoolOrders() async {
    if (mounted) setState(() => _isLoading = true);
    try {
      final res = await _supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('restaurant_id', widget.driver.restaurantId)
          .inFilter('status', ['LISTO_PARA_ENTREGA', 'ASIGNADO', 'LISTO'])
          .order('created_at', ascending: false);

      final list = (res as List).map((e) => OrderModel.fromJson(e)).toList();
      if (mounted) {
        setState(() {
          _availableOrders = list;
        });
      }
    } catch (_) {} finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _subscribeToOrders() {
    _ordersChannel = _supabase
        .channel('pool-orders')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'orders',
          callback: (payload) {
            if (mounted) _loadPoolOrders();
          },
        );
    _ordersChannel?.subscribe();
  }

  Future<void> _acceptOrder(OrderModel order) async {
    try {
      await _supabase.from('orders').update({
        'driver_id': widget.driver.id,
        'status': 'EN_CAMINO',
      }).eq('id', order.id);

      LocationService().startTracking(
        driverId: widget.driver.id,
        restaurantId: widget.driver.restaurantId,
        currentOrderId: order.id,
      );

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => ActiveRouteScreen(
              driver: widget.driver,
              order: order,
              restaurantName: _restaurantName ?? 'Restaurante',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al aceptar el pedido. Intente nuevamente.')),
        );
      }
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('saved_driver_id');
    await LocationService().stopTracking();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.saas100,
      appBar: AppBar(
        backgroundColor: AppColors.saas900,
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.saas600,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.local_shipping_rounded, size: 18, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.driver.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  _restaurantName ?? 'Sabores Milenarios',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFFA5B4FC),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded, size: 20, color: Color(0xFFA5B4FC)),
            onPressed: _logout,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadPoolOrders,
        color: AppColors.saas600,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _availableOrders.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                      Center(
                        child: Column(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.slate200),
                              ),
                              child: const Icon(
                                Icons.inventory_2_outlined,
                                size: 48,
                                color: AppColors.slate400,
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Bolsa de Pedidos Vacía',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'No hay órdenes listas en cocina por el momento.\nDesliza hacia abajo para actualizar.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 13,
                                color: AppColors.slate500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _availableOrders.length,
                    itemBuilder: (context, index) {
                      final order = _availableOrders[index];
                      return Container(
                        margin: const EdgeInsets.only(bottom: 14),
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: AppColors.slate200),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  '#ORD-${order.orderNumber}',
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.slate900,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFD1FAE5),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: const Text(
                                    'LISTO EN COCINA',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFF047857),
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                const Icon(Icons.storefront_rounded, size: 16, color: AppColors.slate500),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Origen: ${_restaurantName ?? "Restaurante"}',
                                    style: const TextStyle(fontSize: 13, color: AppColors.slate600),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.location_on_rounded, size: 16, color: AppColors.brandRed),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Destino: ${order.deliveryAddress}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.slate800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Total: S/ ${order.totalAmount.toStringAsFixed(2)} (${order.paymentMethod})',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.saas600,
                                  ),
                                ),
                                Text(
                                  '${order.items.length} productos',
                                  style: const TextStyle(fontSize: 12, color: AppColors.slate500),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              height: 48,
                              child: ElevatedButton(
                                onPressed: () => _acceptOrder(order),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.saas600,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  elevation: 0,
                                ),
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.check_circle_rounded, size: 18),
                                    SizedBox(width: 8),
                                    Text(
                                      'Aceptar Pedido (Asignarme)',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
