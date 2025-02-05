// mie-03
// - 01
// - adding ocean shader texture
// - 02
// - adds vector tiles (admin lines and highways)
// - 03
// - toggle on angel_instanced_arrays and turn on city point features
// - 03-00
// - this map remains the same, but the underlying pmtiles implementation
// no longer goes from geojson -> georender -> gpu props, but instead directly
// from geojson -> gpu props
// - 03-01
// - adds labeling using latest mixmap-pmtiles internals
const mixmap = require('@rubenrodriguez/mixmap')
const regl = require('regl')
const resl = require('resl')
const {
  default: MixmapPMTiles,
  TileType,
  RasterShaders,
  StencilShaders,
  tilesForBbox,
  layerTileIndex,
  propsForMap,
  spreadStyleTexture,
  tileKeyToProps,
  getImagePixels,
  bboxToMesh,
  fullEarthMesh,
  GeorenderShaders,
  mixmapUniforms,
  TileSetTracker,
} = require('mixmap-pmtiles')
const { decode: decodePng } = require('fast-png')
const { propsIncludeLabels } = require('@rubenrodriguez/mixmap-georender/text')
const { createGlyphProps, Label } = require('tiny-label')
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

      uniform sampler2D raster;
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
        vec4 sample = texture2D(raster, vtcoord);
        if (sample.a < 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        float z = smoothstep(zoomRange.x, zoomRange.y, zoom);
        float tileDim = mix(80.0, 800.0, z);
        vec2 tileSize = vec2(tileDim);
        vec2 origin = tileSpaceCenter(vtcoord, tileSize);
        vec4 originSample = texture2D(raster, origin);
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

      uniform sampler2D raster;
      uniform float zoom;
      uniform vec2 zoomRange, periodRange;
      uniform vec3 colorBg, colorFg;

      varying vec2 vtcoord;
      varying vec2 vpos;

      void main () {
        vec4 sample = texture2D(raster, vtcoord);
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

function addMvtModularly () {
  resl({
    manifest: {
      style: {
        type: 'binary',
        src: './style-textures/pr-mie.png',
        parser: (data) => {
          return decodePng(data)
        },
      },
      labelOpts: {
        type: 'text',
        parser: JSON.parse,
        src: './style-textures/georender-basic-setup-label.json',
      }
    },
    onDone: ready,
  })
  async function ready ({ style, labelOpts }) {
    const draw = {}
    // init within a worker, `update` per tile set
    const labels = new Label(labelOpts)

    // georender-shader-draw-key : [georender-prepare-prop-keys]
    const spread = {
      areas: ['areaP', 'areaT'],
      areaBorders: ['areaBorderP', 'areaBorderT'],
      lineStroke: ['lineP', 'lineT'],
      lineFill: ['lineP', 'lineT'],
      points: ['pointP', 'pointT'],
    }
    const georenderShaders = GeorenderShaders(map)
    const stencilShaders = StencilShaders(map)

    // created draws
    for (const drawKey in spread) {
      const shader = georenderShaders[drawKey]
      delete shader.pickFrag
      draw[drawKey] = map.regl({
        ...shader,
        ...stencilShaders.tileStencilHonor,
        uniforms: {
          ...shader.uniforms,
          ...mixmapUniforms(map),
        }
      })
    }
    draw.stencil = {
      reset: map.regl(stencilShaders.tileStencilReset),
      mark: map.regl(stencilShaders.tileStencilMark),
    }

    draw.label = labelOpts.fontFamily.map(() => map.regl({
      ...georenderShaders.label,
      uniforms: {
        ...georenderShaders.label.uniforms,
        ...mixmapUniforms(map),
      }
    }))

    const tileSetTracker = new TileSetTracker()

    // tileKey : { tileBbox, tileProps }
    const tileKeyPropsMap = new Map()
    let processLabels = false
    let previousProcessLabels = false
    map.on('draw:end', () => {
      console.log('draw-end-draws')
      drawVectorTiles(map, tileKeyPropsMap, draw, spread, labelOpts)
      if (tileSetTracker.isLoaded()) {
        drawLabels(map, draw, tileKeyPropsMap, labels, labelUpdateOpts)
      }
    })
    const stylePixels = style.data
    const imageSize = [style.width, style.height]
    const styleTexture = map.regl.texture(style)
    const labelUpdateOpts = {
      style: {
        data: stylePixels,
        width: style.width,
        height: style.height,
        labelFontFamily: labelOpts.fontFamily,
      },
      labelFeatureTypes: ['point'],
    }

    map.addLayer({
      viewbox: (bbox, zoom, cb) => {
        const tiles = tilesForBbox(bbox, zoom)
        // TODO figure out why we compute more tiles
        // than we actually end up intersecting with our bbox
        // layerCountTarget = tiles.length
        const layerTiles = layerTileIndex(tiles)
        tileSetTracker.setKeysQueued(Object.keys(layerTiles))
        cb(null, layerTiles)
      },
      add: async (tileKey, tileBbox) => {
        try {
          const mapProps = propsForMap(map)
          const { tileProps } = await tileKeyToProps({
            mapProps,
            source: 'http://localhost:9966/pmtiles/pr-mie.mvt.pmtiles',
            tileType: TileType.Mvt,
            tileKey,
            tileBbox,
            prepare: {
              stylePixels,
              imageSize,
              label: labelOpts,
            },
          })

          tileSetTracker.setKeyLoaded(tileKey)
          const processLabels = tileSetTracker.isLoaded()
          console.log('processLabels', processLabels)

          if (tileProps === null && processLabels) {
            console.log('tile-props:null', tileKey)
            drawLabels(map, draw, tileKeyPropsMap, labels, labelUpdateOpts)
            return
          }
          if (tileProps?.texture) {
            tileProps.texture = map.regl.texture(tileProps.texture)
          }
          else {
            // if we are dealing with georender props, we want to
            // spread our style texture within
            spreadStyleTexture(styleTexture, tileProps)
          }
          tileKeyPropsMap.set(tileKey, { tileBbox, tileProps })
          drawVectorTiles(map, tileKeyPropsMap, draw, spread)
          if (processLabels) {
            drawLabels(map, draw, tileKeyPropsMap, labels, labelUpdateOpts)
          }
        }
        catch (error) {
          console.log(error)
        }
      },
      remove: (tileKey, tileBbox) => {
        tileSetTracker.remove(tileKey)
        tileKeyPropsMap.delete(tileKey)
      },
    })
    // map.on('viewbox:internal:end', () => {
    //   console.log('layerTiles', map._layerTiles.length)  
    // })
  }

  // context provides:
  // - labels (tiny-label instance)
  // - labelUpdateOpts (tiny-label.update options)
  function drawLabels (map, draw, tileKeyPropsMap, labels, labelUpdateOpts) {
    const georenderPropsForLabels = []
    for (const [tileKey, { tileProps }] of tileKeyPropsMap) {
      if (propsIncludeLabels(tileProps)) {
        georenderPropsForLabels.push(tileProps)
      }
    }
    console.log('render-labels:start', tileKeyPropsMap.size)
    const t0 = performance.now()
    const labelProps = labels.update(georenderPropsForLabels, propsForMap(map), labelUpdateOpts)
    const t1 = performance.now()
    console.log({labelProps})
    // // back on main thread
    createGlyphProps(labelProps, map)  
    const t2 = performance.now()
    for (const mapProps of map._props()) {
      for (let i = 0; i < labelProps.glyphs.length; i++) {
        const glyphProps = []
        for (let j = 0; j < labelProps.glyphs[i].length; j++) {
          glyphProps.push({
            ...labelProps.glyphs[i][j],
            ...mapProps,
          })
        }
        draw.label[i](glyphProps)
      }  
    }
    const t3 = performance.now()
    console.log('render-labels:end', t1-t0, t2-t1, t3-t2)
  }

  function drawVectorTiles (map, tileKeyPropsMap, draw, spread) {
    console.log('draw-vector-tiles', tileKeyPropsMap.size)
    // TODO write a common `drawRasterTile` setup as well
    for (const mapProps of map._props()) {
      const tileResetProps = {
        ...mapProps,
        ...fullEarthMesh(),
      }
      for (const [tileKey, { tileBbox, tileProps }] of tileKeyPropsMap) {
        if (!tileProps) continue
        const tileMarkProps = {
          ...mapProps,
          ...bboxToMesh(tileBbox),
        }
        draw.stencil.reset(tileResetProps)
        draw.stencil.mark(tileMarkProps)
        for (const drawKey in spread) {
          for (const tilePropKey of spread[drawKey]) {
            if (!draw[drawKey]) continue
            if (!tileProps[tilePropKey]) continue
            draw[drawKey]({
              ...mapProps,
              ...tileProps[tilePropKey],
            })
          }
        }
      }
    }
  }
}


tileGrid(map, { zindex: 1000, color: [0,0,0,1] })
addWaterBg({ zindex: 1 })
addShoreBuffer({ zindex: 20 })
addElevation({ zindex: 30 })
// addMvt({ includePnts: true })
addMvtModularly()

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
