// tiny-label-00
// - 00
// - fork of `mixmap-01`
// - implements the `Atlas` interface of `tiny-label`
// - 01
// - explore what label placement engine output from
//   `tiny-label` looks like
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')
const cityJson = require('../util/pr-cities-population-2024.json')
const { defaultTextOpts, Text, Shaders } = require('tiny-label')
const toGeorender = require('@rubenrodriguez/georender-geojson/to-georender')
const decode = require('@rubenrodriguez/georender-pack/decode')
const { default: prepare } = require('@rubenrodriguez/mixmap-georender/prepare')
const getImagePixels = require('get-image-pixels')

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

async function drawText () {
  const text = new Text({
    ...defaultTextOpts,
    labelEngine: {
      ...defaultTextOpts.labelEngine,
      outlines: true,
    }  
  })
  const style = await (() => {
    const img = new Image()
    const p = new Promise((resolve, reject) => {
      img.onerror = function (error) {
        reject(error)
      }
      img.onload = function () {
        resolve(img)
      }
    })
    img.src = './style-textures/pr-radiating-coastline.png'
    return p
  })()

  const cityGeojson = asGeojson(cityJson)
  // i need data in the shape of georender point labels
  const georender = toGeorender(cityGeojson)
  const decodedToMerge = georender.map((buf) => {
    return decode([buf])
  })
  const decoded = mergeDecoded(decodedToMerge)
  const stylePixels = getImagePixels(style)
  const styleTexture = map.regl.texture(style)
  const geodata = prepare({
    stylePixels,
    styleTexture,
    imageSize: [style.width, style.height],
    decoded,
  })
  const props = geodata.update(map.zoom)
  const textProps = text.update(props, map)

  const shaders = Shaders(map)
  const draw = {
    outlines: map.regl(shaders.outlines),
    text: map.regl(shaders.text(textProps.atlas)),
  }

  for (let i = 0; i < textProps.atlas.glyphs.length; i++) {
    for (const mapProps of map._props()) {
      textProps.atlas.glyphs[i] = Object.assign(textProps.atlas.glyphs[i], mapProps)
    }
  }

  const drawWithMap = () => {
    for (const mapProps of map._props()) {
      draw.outlines({
        ...mapProps,
        ...textProps.labelEngine,
        color: [0, 1, 0],
        zindex: 1000,
      })
      draw.text(textProps.atlas.glyphs)
    }
  }

  map.on('draw:end', drawWithMap)
  map.draw()
  return {
    draw: drawWithMap,
  }
}
drawText()

const drawGlyphs = {
  attributes: {
    position: [
      -1, -1,
      1, -1,
      -1, 1,
      1, 1]
  },
  count: 4,
  primitive: 'triangle strip',
  uniforms: {
    // glyphsTexture, 
    fillDist: 0.6,
    haloDist: 0.2,
    fillColor: [1, 1, 1, 1],
    haloColor: [0, 0, 0, 1],
    screenDim: (context) => [context.viewportWidth, context.viewportHeight],
    aspect: (context) => context.viewportWidth/context.viewportHeight,
    pixelRatio: () => window.devicePixelRatio,
    zindex: 100,
    fontSize: 18,
    anchor: map.prop('anchor'),
    glyphInLabelStringIndex: map.prop('glyphInLabelStringIndex'),
    glyphInLabelStringOffset: map.prop('glyphInLabelStringOffset'),
    labelDim: map.prop('labelDim'),
    glyphTexOffset: map.prop('glyphTexOffset'),
    glyphTexDim: map.prop('glyphTexDim'),
    glyphRasterDim: map.prop('glyphRasterDim'),
    glyphRasterHeight: map.prop('glyphRasterHeight'),
    glyphRasterTop: map.prop('glyphRasterTop'),
    letterSpacing: 0.8,
    // labelTexDim: [texture.width, texture.height],
  },
  vert: `
    precision highp float;
    attribute vec2 position;
    uniform float aspect, zindex, fontSize, pixelRatio;
    uniform float glyphRasterTop;
    uniform float letterSpacing;
    uniform float glyphInLabelStringIndex;
    uniform vec2 anchor;
    uniform vec2 glyphRasterDim;
    uniform vec2 screenDim;
    uniform vec2 glyphInLabelStringOffset;
    uniform vec2 labelDim;
    uniform vec2 glyphTexOffset;
    uniform vec2 glyphTexDim;
    uniform vec2 labelTexDim;
    uniform vec4 viewbox;
    varying vec2 tcoord;
    void main () {
      vec2 uv = position * 0.5 + 0.5;

      vec2 labelScaledFontSize = vec2(
        fontSize * pixelRatio * labelDim.x / labelDim.y,
        fontSize * pixelRatio
      );
      vec2 labelScaledScreen = labelScaledFontSize / screenDim * pixelRatio;
      vec2 glyphScale = glyphRasterDim / labelDim * labelScaledScreen;
      vec2 glyphOffset = vec2(
        glyphInLabelStringOffset.x / labelDim.x * letterSpacing * labelScaledScreen.x,
        (glyphRasterTop - glyphRasterDim.y) / labelDim.y * labelScaledScreen.y
      );

      vec2 p = uv * glyphScale + glyphOffset + anchor;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0+zindex),
        1
      );
      // this should be our position's within the texSize [[0, 1], [0, 1]]
      // tcoord: (texOffset + (texDim * uv)) / texSize
      vec2 flippedUv = vec2(uv.x, 1.0 - uv.y);
      tcoord = (glyphTexOffset + (glyphTexDim * flippedUv)) / labelTexDim;
    }
  `,
  frag: `
    precision highp float;
    uniform sampler2D glyphsTexture;
    uniform float fillDist, haloDist;
    uniform vec4 fillColor, haloColor;
    varying vec2 tcoord;
    void main () {
      vec4 sample = texture2D(glyphsTexture, tcoord);
      float fill = step(fillDist, sample.a);
      float halo = step(fillDist, sample.a) + step(fillDist + haloDist, sample.a);
      vec4 color = vec4(0.0);
      if (halo == 1.0) {
        color = haloColor;
      }
      else if (fill == 1.0) {
        color = fillColor;
      }
      else {
        discard;
        return;
      }
      gl_FragColor = vec4(color.xyzw);
    }
  `,
  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    }
  },
}

const drawNE = map.createDraw({
  attributes: {
    position: map.prop('positions'),
  },
  uniforms: {
    aspect: (context) => context.viewportWidth/context.viewportHeight,
    zindex: 10,
  },
  elements: map.prop('cells'),
  vert: `
    precision highp float;

    attribute vec2 position;
    
    uniform vec4 viewbox;
    uniform vec2 offset;
    uniform float aspect, zindex;

    void main () {
      vec2 p = position.xy + offset;
      gl_Position = vec4(
        (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
        ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
        1.0/(1.0 + zindex), 1);
    }
  `,
  frag: `
    precision highp float;

    void main () {
      gl_FragColor = vec4(1,0,0,1);
    }
  `,
  blend: {
    enable: true,
    func: {
      srcRGB: 'src alpha',
      srcAlpha: 1,
      dstRGB: 'one minus src alpha',
      dstAlpha: 1
    }
  },
})

resl({
  manifest: {
    neGeojson: {
      type: 'text',
      src: 'ne-10m-land-pr.json',
      parser: JSON.parse,
    },
  },
  onDone: ({ neGeojson }) => {
    const neMesh = geojson2mesh(neGeojson)
    // let prSN = [100, 0]
    // neMesh.triangle.positions.forEach(([x, y]) => {
    //   prSN[0] = Math.min(prSN[0], y)
    //   prSN[1] = Math.max(prSN[1], y)
    // })
    // console.log('pr-south-north-extent')
    // console.log(prSN)
    // console.log('pr-vertical-midpoint')
    // console.log((prSN[0] + prSN[1])/2)
    drawNE.props.push({
      positions: neMesh.triangle.positions,
      cells: neMesh.triangle.cells,
    })
    map.draw()
  },
})

const frame = () => {
  map.draw()
}

frame()
// map.regl.frame(frame)

function asGeojson (cityJson) {
  const geojson = { type: 'FeatureCollection', features: [] }
  for (const city of cityJson) {
    const feature = {
      type: 'Feature',
      properties: {
        place: 'city',
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
      elevation: new Float32Array(areaSize),
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
      if (includeAllTags) {
        if (typeof d.line.radiatingCoastlineBufferIndex[k] === 'number') {
          decoded.line.radiatingCoastlineBufferIndex[lineOffset] = d.line.radiatingCoastlineBufferIndex[k]
        }
        if (typeof d.line.radiatingCoastlineBufferDistance[k] === 'number') {
          decoded.line.radiatingCoastlineBufferDistance[lineOffset] = d.line.radiatingCoastlineBufferDistance[k]
        }
      }
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
      if (d.area.elevation[k]) {
        decoded.area.elevation[areaOffset] = d.area.elevation[k]
      }
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
