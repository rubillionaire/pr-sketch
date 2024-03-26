// input does not have a z value so we do it on the unit sphere
vec3 lonLatToSphere (vec2 lonLat) {
  float lon = radians(lonLat.x);
  float lat = radians(lonLat.y);
  float x = cos(lat) * cos(lon);
  float y = cos(lat) * sin(lon);
  float z = sin(lat);
  return vec3(x, y, z);
}

// input has a z value to consider
vec3 lonLatToSphere (vec3 lonLat) {
  float lon = radians(lonLat.x);
  float lat = radians(lonLat.y);
  float x = cos(lat) * cos(lon);
  float y = cos(lat) * sin(lon);
  float z = sin(lat) * lonLat.z;
  return vec3(x, y, z);
}

#pragma glslify: export(lonLatToSphere)
