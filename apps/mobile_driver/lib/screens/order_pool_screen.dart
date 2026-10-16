import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/constants/app_colors.dart';
import '../core/constants/supabase_config.dart';
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
  String _effectiveTenantId = '';
  RealtimeChannel? _ordersChannel;
  Timer? _activeCheckTimer;
  bool _loggingOut = false;

  @override
  void initState() {
    super.initState();
    _effectiveTenantId = widget.driver.restaurantId;
    if (_effectiveTenantId == '00000000-0000-0000-0000-000000000002' || widget.driver.phone == '942000001') {
      _restaurantName = 'Librería Atenea';
      _effectiveTenantId = '00000000-0000-0000-0000-000000000002';
    } else if (_effectiveTenantId == '00000000-0000-0000-0000-000000000001' || widget.driver.phone == '941000001') {
      _restaurantName = 'Fuego & Carbón';
      _effectiveTenantId = '00000000-0000-0000-0000-000000000001';
    }
    _loadPoolOrders();
    _resolveDriverTenant();
    _checkActiveOrder();
    _subscribeToOrders();
    _verifyDriverActive();
    _activeCheckTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _verifyDriverActive(),
    );
  }

  @override
  void dispose() {
    _activeCheckTimer?.cancel();
    if (_ordersChannel != null) {
      _supabase.removeChannel(_ordersChannel!);
    }
    super.dispose();
  }

  /// Revalida contra la BD que el repartidor siga activo y no dado de baja.
  /// Si ya no lo está, se cierra la sesión con el mensaje "Usuario inactivo".
  Future<void> _verifyDriverActive() async {
    if (_loggingOut) return;
    try {
      final res = await _supabase
          .from('drivers')
          .select('is_active, deleted_at')
          .eq('id', widget.driver.id)
          .maybeSingle()
          .timeout(const Duration(seconds: 4));

      final active = res != null &&
          (res['is_active'] as bool? ?? false) &&
          res['deleted_at'] == null;

      if (!active && mounted) {
        await _forceLogout();
      }
    } catch (_) {
      // Fallo temporal de red: no expulsar para no interrumpir el turno.
    }
  }

  Future<void> _forceLogout() async {
    if (_loggingOut || !mounted) return;
    _loggingOut = true;
    _activeCheckTimer?.cancel();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('saved_driver_id');
    try {
      await LocationService().stopTracking();
    } catch (_) {}
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => const LoginScreen(initialMessage: 'Usuario inactivo'),
        ),
      );
    }
  }

  Future<void> _resolveDriverTenant() async {
    try {
      if (_effectiveTenantId.isEmpty) {
        final dRes = await _supabase
            .from('drivers')
            .select('tenant_id')
            .eq('id', widget.driver.id)
            .maybeSingle()
            .timeout(const Duration(seconds: 3));
        if (dRes != null && dRes['tenant_id'] != null) {
          _effectiveTenantId = dRes['tenant_id'] as String;
        }
      }

      if (_effectiveTenantId.isNotEmpty && _restaurantName == null) {
        final res = await _supabase
            .from('tenants')
            .select('name')
            .eq('id', _effectiveTenantId)
            .maybeSingle()
            .timeout(const Duration(seconds: 3));
        if (res != null && mounted) {
          setState(() {
            _restaurantName = res['name'] as String?;
          });
        }
      }
    } catch (e) {
      debugPrint('Error resolving driver tenant: $e');
    }
  }

  Future<void> _checkActiveOrder() async {
    try {
      final res = await _supabase
          .from('orders')
          .select('*')
          .eq('driver_id', widget.driver.id)
          .eq('status', 'EN_CAMINO')
          .limit(1)
          .maybeSingle()
          .timeout(const Duration(seconds: 3));

      if (res != null && mounted) {
        final activeOrder = OrderModel.fromJson(res);
        LocationService().startTracking(
          driverId: widget.driver.id,
          restaurantId: _effectiveTenantId.isNotEmpty ? _effectiveTenantId : widget.driver.restaurantId,
          currentOrderId: activeOrder.id,
        );
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => ActiveRouteScreen(
              driver: widget.driver,
              order: activeOrder,
              restaurantName: _restaurantName ?? 'Librería Atenea',
            ),
          ),
        );
      }
    } catch (_) {}
  }

  Future<List<dynamic>> _fetchOrdersDirectRest(String tenantId) async {
    try {
      final client = HttpClient();
      final uri = Uri.parse(
        '${SupabaseConfig.url}/rest/v1/orders?status=eq.LISTO&order=created_at.desc&select=*'
        '${tenantId.isNotEmpty ? "&tenant_id=eq.$tenantId" : ""}',
      );
      final req = await client.getUrl(uri).timeout(const Duration(seconds: 8));
      req.headers.set('apikey', SupabaseConfig.anonKey);
      req.headers.set('Authorization', 'Bearer ${SupabaseConfig.anonKey}');
      final res = await req.close().timeout(const Duration(seconds: 8));
      final body = await res.transform(utf8.decoder).join();
      final data = jsonDecode(body);
      if (data is List) return data;
    } catch (e) {
      debugPrint('Direct REST fetch error: $e');
    }
    return [];
  }

  Future<void> _loadPoolOrders() async {
    if (mounted) setState(() => _isLoading = true);
    try {
      final tenantId = _effectiveTenantId.isNotEmpty ? _effectiveTenantId : widget.driver.restaurantId;
      debugPrint('🔍 [POOL] Loading pool orders for tenantId: $tenantId, driverId: ${widget.driver.id}');

      List<dynamic> rawList = [];

      try {
        final res = tenantId.isNotEmpty
            ? await _supabase
                .from('orders')
                .select('*')
                .eq('status', 'LISTO')
                .eq('tenant_id', tenantId)
                .order('created_at', ascending: false)
                .timeout(const Duration(seconds: 8))
            : await _supabase
                .from('orders')
                .select('*')
                .eq('status', 'LISTO')
                .order('created_at', ascending: false)
                .timeout(const Duration(seconds: 8));
        rawList = res as List<dynamic>;
      } catch (err) {
        debugPrint('⚠️ [POOL] Postgrest SDK query failed or timed out ($err). Fetching via direct REST...');
        rawList = await _fetchOrdersDirectRest(tenantId);
      }

      // Si por alguna razón la lista vino vacía y tenantId estaba filtrando, intentar sin filtro de tenant
      if (rawList.isEmpty && tenantId.isNotEmpty) {
        debugPrint('ℹ️ [POOL] Checking all LISTO orders without tenant filter...');
        rawList = await _fetchOrdersDirectRest('');
      }

      debugPrint('🔍 [POOL] Raw orders returned: ${rawList.length}');

      final list = rawList
          .map((e) => OrderModel.fromJson(e as Map<String, dynamic>))
          .where((o) => (tenantId.isEmpty || o.restaurantId.isEmpty || o.restaurantId == tenantId) && (o.driverId == null || o.driverId!.isEmpty))
          .toList();

      debugPrint('🔍 [POOL] Available unassigned LISTO orders: ${list.length}');

      if (mounted) {
        setState(() {
          _availableOrders = list;
          _isLoading = false;
        });
      }
    } catch (e, stack) {
      debugPrint('❌ [POOL] Error loading pool orders: $e\n$stack');
    } finally {
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
    // Revalidar que el repartidor siga activo antes de asignarse el pedido
    try {
      final res = await _supabase
          .from('drivers')
          .select('is_active, deleted_at')
          .eq('id', widget.driver.id)
          .maybeSingle()
          .timeout(const Duration(seconds: 4));
      final active = res != null &&
          (res['is_active'] as bool? ?? false) &&
          res['deleted_at'] == null;
      if (!active) {
        await _forceLogout();
        return;
      }
    } catch (_) {
      // Si no se puede verificar por red, continuar; la BD lo bloquea igual.
    }

    try {
      final nowUtc = DateTime.now().toUtc().toIso8601String();
      await _supabase.from('orders').update({
        'driver_id': widget.driver.id,
        'status': 'EN_CAMINO',
        'assigned_at': nowUtc,
        'in_route_at': nowUtc,
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
        final inactive = e.toString().contains('no está activo') ||
            e.toString().contains('no esta activo');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              inactive
                  ? 'Usuario inactivo'
                  : 'Error al aceptar el pedido. Intente nuevamente.',
            ),
          ),
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
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.driver.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    _restaurantName ?? 'Sabores Milenarios',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFFA5B4FC),
                    ),
                  ),
                ],
              ),
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
        onRefresh: () async {
          await _verifyDriverActive();
          await _loadPoolOrders();
        },
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
                              'No hay órdenes listas para despacho por el momento.\nDesliza hacia abajo para actualizar.',
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
                                    'LISTO P/ DESPACHO',
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
