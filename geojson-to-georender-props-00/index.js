const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const decode = require('@rubenrodriguez/georender-pack/decode')
const { featuresToProps } = require('mixmap-pmtiles')

const line = {
  type: "Feature",
  properties: {
    "power": "plant"
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [1, 1],
      [10, 10],
      [20, 20],
      [30, 30],
    ]
  }
}

function encodeDecode (geojson) {
  const georender = toGeorender(geojson)
  console.log({georender})
  const props = decode(georender)
  return props
}

console.log(encodeDecode(line))
console.log(featuresToProps({features:[line]}))