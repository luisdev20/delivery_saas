class DriverModel {
  final String id;
  final String? userId;
  final String restaurantId;
  final String name;
  final String phone;
  final bool isActive;
  final DateTime createdAt;

  DriverModel({
    required this.id,
    this.userId,
    required this.restaurantId,
    required this.name,
    required this.phone,
    required this.isActive,
    required this.createdAt,
  });

  factory DriverModel.fromJson(Map<String, dynamic> json) {
    return DriverModel(
      id: json['id'] as String,
      userId: json['user_id'] as String?,
      restaurantId: json['restaurant_id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
      isActive: json['is_active'] as bool? ?? true,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'restaurant_id': restaurantId,
      'name': name,
      'phone': phone,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
    };
  }
}
