// mie-03
// - 01
// - adding ocean shader texture
// - 02
// - adds vector tiles (admin lines and highways)
// - 03
// - toggle on angel_instanced_arrays and turn on city point features
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const { default: MixmapPMTiles, TileType, RasterShaders } = require('mixmap-pmtiles')
const { default: tileGrid } = require('mixmap-tile-grid')
const mix = mixmap(regl, {
  extensions: [
    'oes_element_index_uint',
    'angle_instanced_arrays',
  ],
  attributes: {
    stencil: true,
  },
})

const colorRgb = {
  green: [97, 192, 113],
  blue: [26, 114, 187],
  white: [255, 255, 255],
}
const colorGlsl = {}
for (const color in colorRgb) {
  colorGlsl[color] = colorRgb[color].map(c => c/255)
}
const zoomRange = [8, 12]

function prViewbox () {
  const prWE = [-67.356661, -65.575714] 
  const prCenter = 18.220148006000038
  // screen height/width = prHeight/prWidth
  // screen height/width  * prWidth = prHeight
  const prHorizontal = (prWE[1] - prWE[0])
  const prHeight = (window.innerHeight/window.innerWidth * prHorizontal)
  const prSN = [prCenter - prHorizontal/2, prCenter + prHorizontal/2]
  const viewbox = [prWE[0],prSN[0],prWE[1],prSN[1]]
  return viewbox
}

const map = mix.create({
  viewbox: prViewbox(),
  backgroundColor: [0.5, 0.5, 0.5, 1.0],
  clear: {
    color: [0.5, 0.5, 0.5, 1.0],
    depth: 1,
    stencil: 0,
  },
})

function addElevation ({ zindex }) {
  const { raster } = RasterShaders(map)
  const elevation = {
    ...raster,
    uniforms: {
      ...raster.uniforms,
      maxElevation: 1016.1,
      dotColor: colorGlsl.green,
      backgroundColor: colorGlsl.white,
      zindex,
      zoomRange,
    },
    vert: `
      precision highp float;

      attribute vec2 position;
      attribute vec2 tcoord;
      uniform vec4 viewbox;
      uniform vec2 offset;
      uniform float aspect, zindex;
      varying vec2 vtcoord;
      varying vec2 vpos;

      void main () {
        vec2 p = position + offset;
        vtcoord = tcoord;
        vpos = position;
        gl_Position = vec4(
          (p.x - viewbox.x) / (viewbox.z - viewbox.x) * 2.0 - 1.0,
          ((p.y - viewbox.y) / (viewbox.w - viewbox.y) * 2.0 - 1.0) * aspect,
          1.0/(1.0 + zindex),
          1.0
        );
      }
    `,
    frag: `
      precision highp float;

      uniform sampler2D texture;
      uniform float maxElevation, zoom;
      uniform vec2 texelSize, zoomRange;
      uniform vec3 dotColor;
      uniform vec3 backgroundColor;

      varying vec2 vtcoord;
      varying vec2 vpos;

      float circle ( vec2 _st, float _radius ) {
        vec2 pos = vec2( 0.5 ) - _st;
        return smoothstep( 1.0 - _radius, 1.0 - _radius + _radius * 0.2, 1.-dot( pos, pos ) * 3.14 );
      }

      vec2 tileSpace ( in vec2 _st, in vec2 numberOfTiles ) {
        _st *= numberOfTiles;
        _st = fract( _st );
        return _st;
      }

      vec2 tileSpaceCenter(in vec2 _st, in vec2 numberOfTiles) {
        _st *= numberOfTiles;
        return (floor(_st) + 0.5) / numberOfTiles;
      }

      float texelToElevation (vec3 texel) {
        return -10000.0 + ((texel.r * 256.0 * 256.0 * 256.0 + texel.g * 256.0 * 256.0 + texel.b * 256.0) * 0.1);
      }

      void main () {
        vec4 sample = texture2D(texture, vtcoord);
        if (sample.a < 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float tileDim = mix(80.0, 800.0, z);
        vec2 tileSize = vec2(tileDim);
        vec2 origin = tileSpaceCenter(vtcoord, tileSize);
        vec4 originSample = texture2D(texture, origin);
        vec2 tiled = tileSpace(vpos, tileSize);
        float elevation = texelToElevation(originSample.xyz);
        float normElevation = clamp(elevation/maxElevation, 0.0, 1.0);
        float inCircle = circle(
          tiled,
          mix(0.2, 0.7, normElevation)
        );
        // float opacity = mix(0., 1., inCircle);
        vec3 color = mix(backgroundColor, dotColor, inCircle);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  }
  new MixmapPMTiles(map, {
    // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/terrain-dem-v1-clipped-pr.pmtiles',
    source: 'http://localhost:9966/pmtiles/terrain-dem-v1-clipped-pr.pmtiles',
    tileType: TileType.Png,
    shaders: {
      elevation,
    },
  })
}

const commonWater = {
  periodRange: [0.01, 0.0014],
}

function addWaterBg ({ zindex }) {
  const { positions, cells } = fullEarthMesh()
  // const { positions, cells } = bboxToMesh(prViewbox())
  const draw = map.createDraw({
    attributes: {
      position: positions,
    },
    elements: cells,
    uniforms: {
      zindex,
      colorBg: colorGlsl.white,
      colorFg: colorGlsl.blue,
      zoomRange,
      periodRange: commonWater.periodRange,
    },
    frag: `
      precision highp float;
      uniform vec3 colorBg, colorFg;
      uniform vec2 zoomRange, periodRange;
      uniform float zoom;
      varying vec2 vpos;
      void main () {
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float period = mix(periodRange.x, periodRange.y, z);
        float frequency = period/2.0;
        float isFg = mod(vpos.y, period);
        vec3 color = mix(
          colorFg,
          colorBg,
          step(isFg, frequency)
        );
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
  })
  draw.props.push({})
}

function addShoreBuffer ({ zindex }) {
  const { raster } = RasterShaders(map)
  const taper = {
    ...raster,
    uniforms: {
      ...raster.uniforms,
      colorBg: colorGlsl.white,
      colorFg: colorGlsl.blue,
      zindex,
      zoomRange,
      periodRange: commonWater.periodRange,
    },
    frag: `
      precision highp float;

      uniform sampler2D texture;
      uniform float zoom;
      uniform vec2 zoomRange, periodRange;
      uniform vec3 colorBg, colorFg;

      varying vec2 vtcoord;
      varying vec2 vpos;

      void main () {
        vec4 sample = texture2D(texture, vtcoord);
        if (sample.a < 1.0 || sample.x < 0.001) {
          discard;
          return;
        }
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float period = mix(periodRange.x, periodRange.y, z);
        float frequencyDivosor = mix(8.0, 2.0, sample.x);
        float frequency = period/frequencyDivosor;
        float isFg = mod(vpos.y, period);
        vec3 color = mix(
          colorFg,
          colorBg,
          step(isFg, frequency)
        );
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    blend: {
      enable: true,
      func: { src: 'src alpha', dst: 'one minus src alpha' },
    },
  }
  new MixmapPMTiles(map, {
    // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/pr-shore-buffered.pmtiles',
    source: 'http://localhost:9966/pmtiles/pr-shore-buffered.pmtiles',
    tileType: TileType.Png,
    shaders: {
      taper,
    },
  })
}

function addMvt ({ includePnts=true }={}) {
  const filterFeature = includePnts ? null : (feature) => (feature.geometry.type !== 'Point')
  var style = new Image
  style.onload = function () {
    new MixmapPMTiles(map, {
      // source: 'https://rr-studio-assets.nyc3.digitaloceanspaces.com/pr-sketch/mie-prefecture/pr-mvt.pmtiles',
      source: 'http://localhost:9966/pmtiles/pr-mie.mvt.pmtiles',
      tileType: TileType.Mvt,
      style,  
      filterFeature,
    })
  }
  style.src = './style-textures/pr-mie.png'
}


// tileGrid(map, { zindex: 1 })
addWaterBg({ zindex: 1 })
addShoreBuffer({ zindex: 20 })
addElevation({ zindex: 30 })
addMvt({ includePnts: true })

window.addEventListener('keydown', function (ev) {
  if (ev.code === 'Equal') {
    map.setZoom(Math.min(20,Math.round(map.getZoom()+1)))
  } else if (ev.code === 'Minus') {
    map.setZoom(map.getZoom()-1)
  }
  console.log('zoom', map.getZoom())
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

function bboxToMesh (bbox) {
  return {
    positions: [
      bbox[0], bbox[1],
      bbox[0], bbox[3],
      bbox[2], bbox[3],
      bbox[0], bbox[1],
      bbox[2], bbox[3],
      bbox[2], bbox[1]
    ],
    cells: [0, 1, 2, 3, 4, 5]
  }
}

function fullEarthMesh () {
  const bbox = [-180, -90, 180, 90]
  return bboxToMesh(bbox)
}
