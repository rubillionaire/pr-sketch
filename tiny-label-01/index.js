// tiny-label-00
// - 00
// - fork of `mixmap-01`
// - implements the `Atlas` interface of `tiny-label`
// - 01
// - explore what label placement engine output from
//   `tiny-label` looks like
// - `tiny-label` @ git hash `563f9b2`
// - `georender-style2png` @ git hash `fda2e22`
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')
const cityJson = require('../util/pr-cities-population-2024.json')
const neJson = require('../public/ne-10m-land-pr.json')
const { defaultLabelOpts, Label, Shaders: LabelShaders } = require('tiny-label')
const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const decode = require('@rubenrodriguez/georender-pack/decode')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const { default: GeorenderShaders } = require('@rubenrodriguez/mixmap-georender')
const makeTexture = require('../util/make-texture')

const searchParams = new URLSearchParams(window.location.search)
const params = {
  display: searchParams.has('display')
    ? searchParams.get('display').split(',').map(s => parseInt(s))
    : null
}
console.log({params})

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerWidth/window.innerHeight * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})

window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(10,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    map.setZoom(map.getZoom()-1)
  }
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

async function drawLabels () {
  const font = new FontFace('Fredoka', "url('fonts/Fredoka-SemiBold.ttf')")
  await font.load()
  document.fonts.add(font)

  const stylesheet = {
    'place.island': {
      'area-fill-color': '#ee0066',
      'area-label-fill-color': '#ee0066',
      'area-label-font': 'Fredoka',
      'area-label-font-size': 20,
      'area-label-stroke-width': 3,
      'area-zindex': 8,
      'area-opacity': 99,
    },
    'place.city': {
      'point-label-font': 'Helvetica',
      'point-label-fill-color': '#000000',
      'point-label-font-size': 18,
      'point-label-stroke-width': 3,
      'point-size': 10,
    },
    'place.town': {
      'point-label-font': 'Helvetica',
      'point-label-fill-color': '#000000',
      'point-label-font-size': 16,
      'point-label-stroke-width': 3,
      'point-size': 8,
    },
    'highway.path': {
      'line-label-font': 'Helvetica',
      'line-label-font-size': 10,
      'line-label-stroke-width': 2,
      'line-label-priority': 10,
      'line-zindex': 20,
    },
  }
  const style = await makeTexture(stylesheet)

  const label = new Label({
    labelEngine: {
      ...defaultLabelOpts.labelEngine,
      outlines: true,
    },
    fontFamily: style.labelFontFamily,
  })

  const cityGeojson = cityToOSM(cityJson)
  const neGeojson = neToOSM(neJson)
  const cityPathsGeojson = cityToLineString(cityJson)
  const geojsons = []
  if (params.display === null) {
    geojsons.push(cityGeojson, neGeojson, cityPathsGeojson)
  }
  if (params.display?.includes(0)) {
    geojsons.push(cityGeojson)
  }
  if (params.display?.includes(1)) {
    geojsons.push(neGeojson)
  }
  if (params.display?.includes(2)) {
    geojsons.push(cityPathsGeojson)
  }

  const geojson = mergeFeatures(...geojsons)
  // const geojson = mergeFeatures(cityPathsGeojson)

  // i need data in the shape of georender point labels
  const georender = toGeorender(geojson)
  const decodedToMerge = georender.map((buf) => {
    return decode([buf])
  })
  const decoded = mergeDecoded(decodedToMerge)
  const stylePixels = {
    data: style.data,
    width: style.width,
    height: style.height,
  }
  const styleTexture = map.regl.texture(stylePixels)
  const geodata = prepare({
    stylePixels,
    styleTexture,
    imageSize: [style.width, style.height],
    decoded,
    zoomStart: 1,
    zoomEnd: 21,
  })
  const props = geodata.update(map.zoom)
  console.log({props})
  console.log({style})
  const labelProps = label.update(props, map, { style })
  console.log({labelProps})

  const labelShaders = LabelShaders(map)
  const georenderShaders = GeorenderShaders(map)
  const areasShader = georenderShaders.areas
  const lineFillShader = georenderShaders.lineFill
  delete areasShader.pickFrag
  delete lineFillShader.pickFrag
  mapUniforms(areasShader)
  mapUniforms(lineFillShader)
  const draw = {
    outlines: map.regl(labelShaders.outlines),
    label: labelProps.atlas.map((prepared) => map.regl(labelShaders.label(prepared))),
    areas: map.regl(areasShader),
    linesFill: map.regl(lineFillShader),
  }

  const atlasProps = []
  for (let i = 0; i < labelProps.atlas.length; i++) {
    const glyphProps = []
    for (let j = 0; j < labelProps.atlas[i].glyphs.length; j++) {
      for (const mapProps of map._props()) {
        const glyph = labelProps.atlas[i].glyphs[j]
        const { fontSize, strokeWidth } = glyph
        const gamma = 2.0 * 1.4142 / fontSize
        const strokeProps = {
          ...mapProps,
          ...glyph,
          buffer: 0.75 - (strokeWidth/fontSize),
          gamma,
          color: glyph.strokeColor,
        }
        const fillProps = {
          ...mapProps,
          ...glyph,
          buffer: 0.75,
          gamma,
          color: glyph.fillColor,
        }
        glyphProps.push(strokeProps)
        glyphProps.push(fillProps)
      }
    }
    atlasProps.push(glyphProps)
  }

  const drawWithMap = () => {
    for (const mapProps of map._props()) {
      draw.outlines({
        ...mapProps,
        ...labelProps.labelEngine,
        color: [0, 1, 0],
        zindex: 1000,
      })
      draw.areas({
        ...mapProps,
        ...props.areaP,
      })
      draw.linesFill({
        ...mapProps,
        ...props.lineP,  
      })
      for (let i = 0; i < atlasProps.length; i++) {
        draw.label[i](atlasProps[i])
      }
    }
  }

  map.on('draw:end', drawWithMap)
  map.draw()
  return {
    draw: drawWithMap,
  }
}
drawLabels()

const frame = () => {
  map.draw()
}

frame()
// map.regl.frame(frame)

function cityToOSM (cityJson) {
  const geojson = { type: 'FeatureCollection', features: [] }
  for (const city of cityJson) {
    const feature = {
      type: 'Feature',
      properties: {
        place: city.population > 35_000 ? 'city' : 'town',
        population: city.population,
        name: city.city,
      },
      geometry: {
        type: 'Point',
        coordinates: city.coordinates,
      }
    }
    geojson.features.push(feature)
  }
  return geojson
}

function cityToLineString (cityJson) {
  const geojson = { type: 'FeatureCollection', features: [] }
  for (let i = 0; i < cityJson.length - 1; i++) {
    for (let j = 1; j < cityJson.length; j++) {
      const ci = cityJson[i]
      const cj = cityJson[j]
      if (!(ci.city === 'San Juan' && cj.city === 'Guayama')) continue
      const feature = {
        type: 'Feature',
        properties: {
          name: `${ci.city} to ${cj.city}`,
          highway: 'path',
        },
        geometry: {
          type: 'LineString',
          coordinates: [ci.coordinates, cj.coordinates],
        }
      }
      geojson.features.push(feature)
    }
  }
  return geojson
}

function neToOSM (neJson) {
  const fc = { type: 'FeatureCollection', features: [] }
  for (const feature of neJson.features) {
    fc.features.push({
      ...feature,
      properties: {
        ...feature.properties,
        name: 'Puerto Rico',
        place: 'island',
      }  
    })
  }
  return fc
}

function mergeFeatures (...geojsons) {
  const fc = { type: 'FeatureCollection', features: [] }
  for (const geojson of geojsons) {
    for (const feature of geojson.features) {
      fc.features.push(feature)
    }
  }
  return fc
}

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

function mapUniforms (props) {
  props.uniforms.viewbox = map.prop('viewbox')
  props.uniforms.offset = map.prop('offset')
  props.uniforms.aspect = (context) => context.viewportWidth/context.viewportHeight
  props.uniforms.zoom = map.prop('zoom')
}
