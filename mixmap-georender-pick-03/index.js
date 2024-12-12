// mixmap-georender-pick
// - 00
// - draw pr island and enable picking
// - 01
// - works on ios
// - use a uint8 pickfb and pack the .xyz components with the index value
// - up to 256^3 values can be captured in this range
// - 02
// - now linked `int-pack-vec3` to pave the way for `mixmap-georender` usage
// - 03
// - folded -02 changes into mixmap-georender to disseminate the common pattern
const regl = require('regl')
const glsl = require('glslify')
const mixmap = require('@rubenrodriguez/mixmap')
const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const { default: shaders, pickfb } = require('@rubenrodriguez/mixmap-georender')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const decode = require('@rubenrodriguez/georender-pack/decode')
const makeStylesheet = require('../util/make-texture.js')

const prGeoJson = require('../public/ne-50m-land-pr.json')
// we need an id to pick from in the end
prGeoJson.features = prGeoJson.features.map((f, i) => {
  f.properties.natural = 'other'
  f.properties.id = i + 101
  return f
})

const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
  ]
})

const prWE = [-67.356661, -65.575714] 
const prCenterX = (prWE[0] + prWE[1]) / 2
const prCenterY = 18.220148006000038
const prHorizontal = (prWE[1] - prWE[0])
const prSN = [prCenterY - (prHorizontal/2), prCenterY + (prHorizontal/2)]
let startViewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]

const map = mix.create({
  viewbox: startViewbox,
  pickfb,
})

window.addEventListener('resize', () => {
  map.resize(window.innerWidth, window.innerHeight)
})
document.body.style.margin = '0'
document.body.appendChild(mix.render())
document.body.appendChild(map.render({
  width: window.innerWidth,
  height: window.innerHeight,
}))

const { areas, pick } = shaders(map)

window.addEventListener('click', (event) => {
  console.log('click')
  pick(event, (err, picked) => {
    if (err) return console.log(err)
    console.log({picked})
    const { index, pickType } = picked
    for (const props of draw.areas.props) {
      const id = props.indexToId[index]
      if (Number.isInteger(id)) {
        console.log({id})
      }
    }
  })
})

const draw = {
  areas: map.createDraw(areas),
}

const geobuf = toGeorender(mergeFeatures(prGeoJson, naturalWaterGeojson()), {
  propertyMap: (props) => {
    return {
      ...props,
    }
  },
})
const decoded = geobuf.map(buf => decode([buf]))
const decodedToPrepare = mergeDecoded(decoded)

const makeMap = async () => {
  const stylesheet = {
    'natural.other': {
      'area-fill-color': '#db22c6',
      'area-zindex': 2,
    },
    'natural.water': {
      'area-fill-color': '#27d7c7',
      'area-zindex': 3,
    },
  }
  const style = await makeStylesheet(stylesheet)
  const stylePixels = style
  const styleTexture = map.regl.texture(style)

  const geodata = prepare({
    stylePixels,
    styleTexture,
    imageSize: [style.width, style.height],
    decoded: decodedToPrepare,
  })

  const props = geodata.update(map)

  setProps(draw.areas.props, props.areaP)

  map.draw()
  // HACK: initialize the pick frag fbo so that we can pick up data
  // on the first actual user pick
  // TODO is this based on the timing? like, is our javascript progressing
  // faster than the draw call?
  // map.pick({ offsetX: 0, offsetY: 0 }, () => { return })
}

makeMap()

function mergeDecoded(mdecoded) {
  var pointSize = 0, lineSize = 0, areaSize = 0, areaCellSize = 0, areaBorderSize = 0
  for (var i = 0; i < mdecoded.length; i++) {
    var d = mdecoded[i]
    pointSize += d.point.types.length
    lineSize += d.line.types.length
    areaSize += d.area.types.length
    areaCellSize += d.area.cells.length
    areaBorderSize += d.areaBorder.types.length
  }
  var decoded = {
    point: {
      ids: Array(pointSize).fill(0),
      types: new Float32Array(pointSize),
      positions: new Float32Array(pointSize*2),
      labels: {},
    },
    line: {
      ids: Array(lineSize).fill(0),
      types: new Float32Array(lineSize),
      positions: new Float32Array(lineSize*2),
      normals: new Float32Array(lineSize*2),
      radiatingCoastlineBufferIndex: new Float32Array(lineSize),
      radiatingCoastlineBufferDistance: new Float32Array(lineSize),
      labels: {},
    },
    area: {
      ids: Array(areaSize).fill(0),
      types: new Float32Array(areaSize),
      positions: new Float32Array(areaSize*2),
      cells: new Uint32Array(areaCellSize),
      labels: {},
    },
    areaBorder: {
      ids: Array(areaBorderSize).fill(0),
      types: new Float32Array(areaBorderSize),
      positions: new Float32Array(areaBorderSize*2),
      normals: new Float32Array(areaBorderSize*2),
      labels: {},
    },
  }
  var pointOffset = 0, lineOffset = 0, areaOffset = 0, areaCellOffset = 0, areaBorderOffset = 0
  for (var i = 0; i < mdecoded.length; i++) {
    var d = mdecoded[i]
    for (var k = 0; k < d.point.types.length; k++) {
      decoded.point.ids[pointOffset] = d.point.ids[k]
      decoded.point.types[pointOffset] = d.point.types[k]
      decoded.point.positions[pointOffset*2+0] = d.point.positions[k*2+0]
      decoded.point.positions[pointOffset*2+1] = d.point.positions[k*2+1]
      pointOffset++
    }
    Object.assign(decoded.point.labels, d.point.labels)
    for (var k = 0; k < d.line.types.length; k++) {
      decoded.line.ids[lineOffset] = d.line.ids[k]
      decoded.line.types[lineOffset] = d.line.types[k]
      decoded.line.positions[lineOffset*2+0] = d.line.positions[k*2+0]
      decoded.line.positions[lineOffset*2+1] = d.line.positions[k*2+1]
      decoded.line.normals[lineOffset*2+0] = d.line.normals[k*2+0]
      decoded.line.normals[lineOffset*2+1] = d.line.normals[k*2+1]
      lineOffset++
    }
    Object.assign(decoded.line.labels, d.line.labels)
    for (var k = 0; k < d.area.cells.length; k++) {
      decoded.area.cells[areaCellOffset++] = d.area.cells[k] + areaOffset
    }
    for (var k = 0; k < d.area.types.length; k++) {
      decoded.area.ids[areaOffset] = d.area.ids[k]
      decoded.area.types[areaOffset] = d.area.types[k]
      decoded.area.positions[areaOffset*2+0] = d.area.positions[k*2+0]
      decoded.area.positions[areaOffset*2+1] = d.area.positions[k*2+1]
      areaOffset++
    }
    Object.assign(decoded.area.labels, d.area.labels)
    for (var k = 0; k < d.areaBorder.types.length; k++) {
      decoded.areaBorder.ids[areaBorderOffset] = d.areaBorder.ids[k]
      decoded.areaBorder.types[areaBorderOffset] = d.areaBorder.types[k]
      decoded.areaBorder.positions[areaBorderOffset*2+0] = d.areaBorder.positions[k*2+0]
      decoded.areaBorder.positions[areaBorderOffset*2+1] = d.areaBorder.positions[k*2+1]
      decoded.areaBorder.normals[areaBorderOffset*2+0] = d.areaBorder.normals[k*2+0]
      decoded.areaBorder.normals[areaBorderOffset*2+1] = d.areaBorder.normals[k*2+1]
      areaBorderOffset++
    }
    Object.assign(decoded.areaBorder.labels, d.areaBorder.labels)
  }
  return decoded
}

function setProps(dst, src) {
  if (dst.length === 0) dst.push({})
  Object.assign(dst[0],src)
}

function mergeFeatures (...fcs) {
  const r = {
    ...fcs[0],
    features: [],
  }
  for (const fc of fcs) {
    r.features = r.features.concat(fc.features)
  }
  return r
}

function naturalWaterGeojson () {
  return {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          natural: 'water',
          id: 200,
        },
        "geometry": {
          "coordinates": [
            [
              [
                -66.418330253172,
                18.244028236608287
              ],
              [
                -66.418330253172,
                18.14586970646758
              ],
              [
                -66.2752658258928,
                18.14586970646758
              ],
              [
                -66.2752658258928,
                18.244028236608287
              ],
              [
                -66.418330253172,
                18.244028236608287
              ]
            ]
          ],
          "type": "Polygon"
        }
      }
    ]
  }
}