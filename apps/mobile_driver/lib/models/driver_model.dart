class DriverModel {
  final String id;
  final String? userId;
  final String restaurantId;
  final String name;
  final String phone;
  final bool isActive;
  final DateTime? deletedAt;
  final DateTime createdAt;

  DriverModel({
    required this.id,
    this.userId,
    required this.restaurantId,
    required this.name,
    required this.phone,
    required this.isActive,
    this.deletedAt,
    required this.createdAt,
  });

  bool get isDeleted => deletedAt != null;

  factory DriverModel.fromJson(Map<String, dynamic> json) {
    final deletedAt = json['deleted_at'] != null
        ? DateTime.tryParse(json['deleted_at'] as String)
        : null;
    return DriverModel(
      id: (json['id'] as String?) ?? '',
      userId: json['user_id'] as String?,
      restaurantId: (json['tenant_id'] as String?) ?? (json['restaurant_id'] as String?) ?? '',
      name: (json['name'] as String?) ?? 'Repartidor',
      phone: (json['phone'] as String?) ?? '',
      // Un repartidor dado de baja se considera inactivo a todos los efectos
      isActive: (json['is_active'] as bool? ?? true) && deletedAt == null,
      deletedAt: deletedAt,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'tenant_id': restaurantId,
      'restaurant_id': restaurantId,
      'name': name,
      'phone': phone,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
    };
  }
}
