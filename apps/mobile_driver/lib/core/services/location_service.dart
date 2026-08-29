import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  StreamSubscription<Position>? _positionStreamSubscription;
  Timer? _periodicTimer;
  Position? _lastKnownPosition;
  Position? get currentPosition => _lastKnownPosition;

  final _locationController = StreamController<Position>.broadcast();
  Stream<Position> get onLocationChanged => _locationController.stream;

  final _supabase = Supabase.instance.client;

  Future<bool> checkAndRequestPermission() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        // In emulators, isLocationServiceEnabled can be true or false
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
    } catch (_) {
      return false;
    }
  }

  Future<Position?> getCurrentLocation({double defaultLat = -12.0464, double defaultLng = -77.0428}) async {
    bool hasPermission = await checkAndRequestPermission();

    if (hasPermission) {
      try {
        // Try last known first for immediate response
        final lastKnown = await Geolocator.getLastKnownPosition();
        if (lastKnown != null) {
          _lastKnownPosition = lastKnown;
          return lastKnown;
        }

        // Try current position with timeout
        _lastKnownPosition = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.medium,
            timeLimit: Duration(seconds: 4),
          ),
        );
        return _lastKnownPosition;
      } catch (_) {}
    }

    // Fallback position for emulator or when GPS is warming up
    _lastKnownPosition ??= Position(
      latitude: defaultLat,
      longitude: defaultLng,
      timestamp: DateTime.now(),
      accuracy: 10,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );

    return _lastKnownPosition;
  }

  void startTracking({
    required String driverId,
    required String restaurantId,
    String? currentOrderId,
    double defaultLat = -12.0464,
    double defaultLng = -77.0428,
  }) async {
    await stopTracking();

    // 1. Send immediate first location
    final initialPos = await getCurrentLocation(defaultLat: defaultLat, defaultLng: defaultLng);
    if (initialPos != null) {
      _lastKnownPosition = initialPos;
      _locationController.add(initialPos);
      _sendLocationToSupabase(
        driverId: driverId,
        restaurantId: restaurantId,
        currentOrderId: currentOrderId,
        position: initialPos,
      );
    }

    // 2. Continuous position stream (distanceFilter: 0 for realtime updates)
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 0,
    );

    try {
      _positionStreamSubscription = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen((Position position) {
        _lastKnownPosition = position;
        _locationController.add(position);
        _sendLocationToSupabase(
          driverId: driverId,
          restaurantId: restaurantId,
          currentOrderId: currentOrderId,
          position: position,
        );
      });
    } catch (_) {}

    // 3. Periodic heartbeat timer every 3 seconds to guarantee updates in emulator / background
    _periodicTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        ).timeout(const Duration(seconds: 2));
        _lastKnownPosition = pos;
        _locationController.add(pos);
        _sendLocationToSupabase(
          driverId: driverId,
          restaurantId: restaurantId,
          currentOrderId: currentOrderId,
          position: pos,
        );
      } catch (_) {
        if (_lastKnownPosition != null) {
          _sendLocationToSupabase(
            driverId: driverId,
            restaurantId: restaurantId,
            currentOrderId: currentOrderId,
            position: _lastKnownPosition!,
          );
        }
      }
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
    _periodicTimer?.cancel();
    _periodicTimer = null;
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
