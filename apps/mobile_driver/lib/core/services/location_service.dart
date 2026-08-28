import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  StreamSubscription<Position>? _positionStreamSubscription;
  Position? _lastKnownPosition;
  Position? get currentPosition => _lastKnownPosition;

  final _supabase = Supabase.instance.client;

  Future<bool> checkAndRequestPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  Future<Position?> getCurrentLocation() async {
    bool hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return null;
    try {
      _lastKnownPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      return _lastKnownPosition;
    } catch (_) {
      return null;
    }
  }

  void startTracking({
    required String driverId,
    required String restaurantId,
    String? currentOrderId,
  }) async {
    bool hasPermission = await checkAndRequestPermission();
    if (!hasPermission) return;

    await stopTracking();

    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );

    _positionStreamSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((Position position) {
      _lastKnownPosition = position;
      _sendLocationToSupabase(
        driverId: driverId,
        restaurantId: restaurantId,
        currentOrderId: currentOrderId,
        position: position,
      );
    });
  }

  Future<void> _sendLocationToSupabase({
    required String driverId,
    required String restaurantId,
    String? currentOrderId,
    required Position position,
  }) async {
    try {
      await _supabase.from('driver_locations').upsert({
        'driver_id': driverId,
        'restaurant_id': restaurantId,
        'current_order_id': currentOrderId,
        'current_lat': position.latitude,
        'current_lng': position.longitude,
        'updated_at': DateTime.now().toIso8601String(),
      });
    } catch (_) {}
  }

  Future<void> stopTracking() async {
    await _positionStreamSubscription?.cancel();
    _positionStreamSubscription = null;
  }

  double calculateDistanceInKm(double startLat, double startLng, double endLat, double endLng) {
    double distanceInMeters = Geolocator.distanceBetween(startLat, startLng, endLat, endLng);
    return distanceInMeters / 1000.0;
  }

  int estimateMinutes(double distanceKm, {double averageSpeedKmH = 25.0}) {
    if (distanceKm <= 0) return 1;
    double hours = distanceKm / averageSpeedKmH;
    int minutes = (hours * 60).ceil();
    return minutes > 0 ? minutes : 1;
  }
}
