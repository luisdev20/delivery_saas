class OrderItemModel {
  final String id;
  final String orderId;
  final String? productId;
  final String productName;
  final int quantity;
  final double unitPrice;

  OrderItemModel({
    required this.id,
    required this.orderId,
    this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
  });

  factory OrderItemModel.fromJson(Map<String, dynamic> json) {
    return OrderItemModel(
      id: (json['id'] as String?) ?? '',
      orderId: (json['order_id'] as String?) ?? '',
      productId: json['product_id'] as String?,
      productName: (json['product_name'] as String?) ?? 'Artículo',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: (json['unit_price'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class OrderModel {
  final String id;
  final String restaurantId;
  final String? driverId;
  final int orderNumber;
  final String customerName;
  final String customerPhone;
  final String deliveryAddress;
  final String? deliveryReference;
  final double deliveryLat;
  final double deliveryLng;
  final String status;
  final String pinCode;
  final String paymentMethod;
  final double? cashAmountChange;
  final double totalAmount;
  final String? notes;
  final DateTime createdAt;
  final DateTime? deliveredAt;
  final List<OrderItemModel> items;

  OrderModel({
    required this.id,
    required this.restaurantId,
    this.driverId,
    required this.orderNumber,
    required this.customerName,
    required this.customerPhone,
    required this.deliveryAddress,
    this.deliveryReference,
    required this.deliveryLat,
    required this.deliveryLng,
    required this.status,
    required this.pinCode,
    required this.paymentMethod,
    this.cashAmountChange,
    required this.totalAmount,
    this.notes,
    required this.createdAt,
    this.deliveredAt,
    this.items = const [],
  });

  factory OrderModel.fromJson(Map<String, dynamic> json) {
    var rawItems = json['order_items'] as List<dynamic>? ?? [];
    return OrderModel(
      id: (json['id'] as String?) ?? '',
      restaurantId: (json['restaurant_id'] as String?) ?? '',
      driverId: json['driver_id'] as String?,
      orderNumber: (json['order_number'] as num?)?.toInt() ?? 0,
      customerName: (json['customer_name'] as String?) ?? 'Cliente',
      customerPhone: (json['customer_phone'] as String?) ?? '',
      deliveryAddress: (json['delivery_address'] as String?) ?? '',
      deliveryReference: json['delivery_reference'] as String?,
      deliveryLat: (json['delivery_lat'] as num?)?.toDouble() ?? -12.0864,
      deliveryLng: (json['delivery_lng'] as num?)?.toDouble() ?? -77.0328,
      status: (json['status'] as String?) ?? 'RECIBIDO',
      pinCode: () {
        final rawPin = json['pin_code'] as String?;
        if (rawPin != null && rawPin.isNotEmpty) return rawPin;
        final rawNotes = json['notes'] as String?;
        if (rawNotes != null) {
          final match = RegExp(r'\[PIN:\s*(\d{4})\]').firstMatch(rawNotes);
          if (match != null) return match.group(1)!;
        }
        return '1234';
      }(),
      paymentMethod: (json['payment_method'] as String?) ?? 'YAPE',
      cashAmountChange: json['cash_amount_change'] != null
          ? (json['cash_amount_change'] as num).toDouble()
          : null,
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0.0,
      notes: json['notes'] as String?,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
      deliveredAt: json['delivered_at'] != null
          ? DateTime.tryParse(json['delivered_at'] as String)
          : null,
      items: rawItems
          .whereType<Map<String, dynamic>>()
          .map((e) => OrderItemModel.fromJson(e))
          .toList(),
    );
  }
}
