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
      id: json['id'] as String,
      orderId: json['order_id'] as String,
      productId: json['product_id'] as String?,
      productName: json['product_name'] as String,
      quantity: json['quantity'] as int,
      unitPrice: (json['unit_price'] as num).toDouble(),
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
    this.pinCode = '1234',
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
      id: json['id'] as String,
      restaurantId: json['restaurant_id'] as String,
      driverId: json['driver_id'] as String?,
      orderNumber: json['order_number'] as int,
      customerName: json['customer_name'] as String,
      customerPhone: json['customer_phone'] as String,
      deliveryAddress: json['delivery_address'] as String,
      deliveryReference: json['delivery_reference'] as String?,
      deliveryLat: (json['delivery_lat'] as num).toDouble(),
      deliveryLng: (json['delivery_lng'] as num).toDouble(),
      status: json['status'] as String,
      pinCode: (json['pin_code'] as String?) ?? '1234',
      paymentMethod: json['payment_method'] as String,
      cashAmountChange: json['cash_amount_change'] != null
          ? (json['cash_amount_change'] as num).toDouble()
          : null,
      totalAmount: (json['total_amount'] as num).toDouble(),
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      deliveredAt: json['delivered_at'] != null
          ? DateTime.parse(json['delivered_at'] as String)
          : null,
      items: rawItems.map((e) => OrderItemModel.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
