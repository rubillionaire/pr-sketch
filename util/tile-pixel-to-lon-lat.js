function tilePixelToLonLat (tileX, tileY, pixelX, pixelY, zoom) {
  const globalX = tileX * 256 + pixelX
  const globalY = tileY * 256 + pixelY
  const mapSize = 256 * Math.pow(2, zoom)

  const normX = globalX / mapSize
  const normY = globalY / mapSize

  const lon = normX * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * normY)))
  const lat = latRad * 180 / Math.PI

  return [lon, lat]
}

module.exports = tilePixelToLonLat