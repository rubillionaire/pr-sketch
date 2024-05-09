// tiny-label-00
// - 00
// - fork of `mixmap-01`
// - implements the `Atlas` interface of `tiny-label`
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const geojson2mesh = require('earth-mesh')
const cityJson = require('../util/pr-cities-population-2024.json')
const { Atlas } = require('tiny-label')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const prWE = [-67.356661, -65.575714] 
const prCenter = 18.220148006000038
// screen height/width = prHeight/prWidth
// screen height/width  * prWidth = prHeight
const prHorizontal = (prWE[1] - prWE[0])
const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
// const prSN = [prCenter - prHeight/2, prCenter + prHeight/2]
const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]

const map = mix.create({
  // viewbox: [-67.356661,17.854597,-65.575714,18.517377],
  viewbox: [prWE[0],prSN[0],prWE[1],prSN[1]],
  backgroundColor: [0.5, 0.5, 0.5, 1.0],  
})
const atlas = new Atlas({
  fontSize: 48,
  buffer: 3,
  radius: 8,
  cutoff: 0.25,
  fontFamily: 'Arial',
})
const labels = []
const cityGeojson = asGeojson(cityJson)
for (const feature of cityGeojson.features) {
  const text = feature.properties.name
  labels.push({
    text,
    anchor: feature.geometry.coordinates,  
  })
}
const { texture, glyphs } = atlas.prepare({ labels })
const glyphsTexture = map.regl.texture(texture)

const drawGlyphs = map.createDraw({
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
    glyphsTexture, 
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
    labelTexDim: [texture.width, texture.height],
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
})
drawGlyphs.props = glyphs

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
