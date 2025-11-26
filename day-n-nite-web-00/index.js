// print day n nite 00
// - fork of scroll-day-n-nite-09
var app = require('choo')()
var html = require('choo/html')
var onload = require('on-load')
var bel = require('bel')
var defregl = require('deferred-regl')
const mixmap = require('@rubenrodriguez/mixmap')
const { pickUnpack } = require('@rubenrodriguez/mixmap-georender')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { createMap, createProps, createDraws, spreadProps } = require('./map')
const MapFillParent = require('./map-fill-parent')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const searchParamsString = window.location.search.slice(1)
const searchParams = new URLSearchParams(searchParamsString)
const colors = searchParams.has('light') && searchParams.has('dark')
  ? {
      light: JSON.parse(searchParams.get('light')).map(n => parseFloat(n)),
      dark: JSON.parse(searchParams.get('dark')).map(n => parseFloat(n)),
    }
  : undefined

let bodyStyle = ''
if (colors) {
  for (const name in colors) {
    const rgb = `rgb(${colors[name].join(', ')})`
    const property = `--color-${name}: ${rgb};`
    bodyStyle += `${property}\n`
  }
}

const mixSpecs = [
  {
    mixName: 'background',
    zindex: 0,
  },
  // {
  //   mixName: 'foreground',
  //   zindex: 1,
  // },
]

const mixs = []
const getMixSpec = (mixName) => mixs.find(m => m.mixName === mixName)
const getMixSpecProp = (prop) => (mixName) => getMixSpec(mixName)[prop]
const getMix = getMixSpecProp('mix')
const getMixZindex = getMixSpecProp('zindex')

// for (const spec of mixSpecs) {
//   const reglOpts = {
//     extensions: ['oes_element_index_uint'],
//   }
//   const mix = mixmap(regl, reglOpts)
//   mixs.push(Object.assign({ mix }, spec))
// }

const staticRadiatingCoastlineOpts = {
  tick: 0,
}
const smallRadiatingCoastlineOpts = {
  displayThreshold: 0.22,
}
const tickPositions = {
  earlymorning: { tick: 1415 },
  noon: { tick: 1600 },
  afternoon: { tick: 1700 },
  lateafternoon: { tick: 1729 },
  midnight:  { tick: 1100 },
}
const viewboxes = {
  cerroDePunta: {
    center: [-66.591839, 18.172458],
    aspect: 1,
    xRadius: 0.1,
  },
  nightSanJuan: {
    center: [-66.105735, 18.465539],
    aspect: 1,
    xRadius: 0.1, 
  },
  nightÁreaMetro: {
    center: [-66.064735, 18.425539],
    aspect: 1,
    xRadius: 0.13, 
  },
  nightPonce: {
    center: [-66.614062, 18.011077],
    aspect: 1,
    xRadius: 0.13,
  },
  nightCayey: {
    center: [-66.161564, 18.111405],
    aspect: 1,
    xRadius: 0.13,
  },
  nightFajardo: {
    center: [-65.650529, 18.325787],
    aspect: 1,
    xRadius: 0.1, 
  },
   nightManatí: {
    center: [-66.482922, 18.429664],
    aspect: 1,
    xRadius: 0.1, 
  },
   nightManatíCluster: {
    center: [-66.472922, 18.429664],
    aspect: 1,
    xRadius: 0.13, 
  }
}
const tickRanges = {
  mapFadingIn: [1350, 1420],
}
/*
disableDraws.ocean
disableDraws.coastlineShadow
disableDraws.terrainImgTile
disableDraws.radiatingCoastline
disableDraws.city
 */
const disableDraws = {
  night: {
    disableDraws: {
      coastlineShadow: true,
    },
  },
  day: {
    disableDraws: {
      city: true,
    }
  },
  inlandDay: {
    disableDraws: {
      city: true,
      coastlineShadow:  true,
      ocean: true,
      radiatingCoastline: true,
    }
  },
  inlandNight: {
    disableDraws: {
      coastlineShadow:  true,
      radiatingCoastline: true,
    }
  },
}

const maps = []
const getName = (name) => maps.find(m => m.name === name)
const getProp = (prop) => (name) => getName(name)[prop]
const setProp = (prop) => (name, state) => getName(name)[prop](state)
const mixForSpec = (spec) => spec.mix === undefined ? getMix('background') : getMix(spec.mix)
// const getTick = (name) => {
//   const i = maps.findIndex(m => m.name === name)
//   const mix = mixForSpec(getName(name))
//   return () => mix._rcom._mregl.subcontexts[i].tick
// }
const getMap = getProp('map')
const getDrawCmds = getProp('drawCmds')
const setLightPosictionTick = setProp('updateLightPositionForTick')
const getGloblalContext = getProp('globalContext')
const getState = getProp('state')

const mapSpecs = [
  {
    name: 'nightMap',
    mapProps: {},
    drawProps: {},
    animated: true,
    state: {play: true, tick: 0},
    mixName: 'background',
  },
]

mapSpecs.forEach((spec) => {
  const reglOpts = {
    extensions: ['oes_element_index_uint'],
  }
  const mix = mixmap(regl, reglOpts)
  
  mixs.push(Object.assign({ mix }, spec))
})

for (const spec of mapSpecs) {
  const { name, mapProps, drawProps, animated, state } = spec
  if (mapProps.viewbox && !Array.isArray(mapProps.viewbox)) {
    const vb = mapProps.viewbox
    if (vb.center && vb.aspect === 1 && vb.xRadius) {
      mapProps.viewbox = [
        vb.center[0] - vb.xRadius,
        vb.center[1] - vb.xRadius,
        vb.center[0] + vb.xRadius,
        vb.center[1] + vb.xRadius,
      ]
    }
  }
  if (animated) {
    drawProps.radiatingCoastlineOpts = {
      tick: () => {
        return state.tick
      },
    }
  }
  const mix = mixForSpec(spec)
  const { map } = createMap(Object.assign({ mix, name, colors }, mapProps))
  const drawOpts = createDraws(Object.assign({ map, colors }, drawProps))
  maps.push(Object.assign({ map }, spec, drawOpts))
}

const mapPerMix = mixs
  .map(({ mixName, mix }) => {
    const { map } = maps.find(s => s.mixName === mixName)
    return { mixName, map }
  })

function mapScroll2 (state, emit) {
  return html`<body class=${prefix} style=${bodyStyle}>
    ${mixs.map(({ mix }) => {
      return mix.render()
    })}
    <main class="">
      <section class="full-width aspect-pr">
        ${state.cache(MapFillParent, 'nightMap').render({
          map: getMap('nightMap'),
          props: {
            width: 0,
            height: 0,
            mouse: false,
            attributes: {
              class: 'map',
            },
          }
        })}
      </section>
    </main>
  </body>`
}
async function mapScroll2Store (state, emitter) {
  console.log('store-initialized')
  let cities
  let setHighlight
  let highlightAllCities = []

  for (const { name } of maps) {
    state[name] = getState(name)
    if (getState(name).hasOwnProperty('tick')) {
      setLightPosictionTick(name, getState(name))
    }
  }

  createProps({ maps: mapPerMix }).then(({ props, cityJson }) => {
    for (const { name, mixName } of mapSpecs) {
      const map = getMap(name)
      const draw = getDrawCmds(name)
      spreadProps({ map, draw, props, mixName })
    }
    emitter.emit('draws-ready')
  })
  .catch((error) => {
    console.log(error)
  })

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
  })

  emitter.on('draws-ready', () => {
    console.log('draws-ready')
    emitter.emit('render')

    frame()
  })

  // window.addEventListener('regl-ready', (event) => {
  //   console.log('regl-ready')
  //   const { spec } = event.detail
  //   const map = getMap(spec.name)
  //   map._unload()
  //   map._load({ regl: event.detail.regl, rcom: event.detail.rcom })
  // })

  function frame () {
    setLightPosictionTick('nightMap', state.nightMap)
    // drawing any map will re-draw all of them that are already
    // on screen based on mixmap > regl-component/multi
    mapPerMix.forEach(({ map }) => {
      map.draw()
    })
    state.nightMap.tick += 1

    window.requestAnimationFrame(frame)
  }
}

app.route('/', mapScroll2)
app.route('/*', mapScroll2)

app.use(mapScroll2Store)

app.mount('body')

// i want to have functions that listen for scroll and resizing
// scroll:
// 1. get the current scroll top of the map element
// 2. see where that scroll top is in comparision to the max travel distance
// - max travel distance:
// -- section height
// -- section top
function trackProgress (id, onProgress) {
  const sectionEl = document.getElementById(id)
  const mapEl = sectionEl.querySelector('.map')

  const resize = () => {
    
  }

  const scroll = () => {
    const sectionBbox = sectionEl.getBoundingClientRect()
    const mapBbox = mapEl.getBoundingClientRect()
    const maxTravelDistance = sectionBbox.height - mapBbox.height
    const travelDistance = mapBbox.top - sectionBbox.top
    const clampedTravelDistance = Math.max(Math.min(travelDistance, maxTravelDistance), 0.0)
    const travelPercent = clampedTravelDistance/maxTravelDistance
    onProgress(travelPercent, { section: sectionBbox, map: mapBbox })
  }

  return {
    resize,
    scroll,
  }
}

window.downloadCanvas = () => {
  const mapCanvas = document.querySelector('canvas')

  // const downloadCanvas = document.createElement('canvas')
  // downloadCanvas.width = mapCanvas.width
  // downloadCanvas.height = mapCanvas.height
  // const context = downloadCanvas.getContext('2d')
  // context.drawImage(mapCanvas, 0, 0)
  // const du = mapCanvas.toDataURL()
  // function download (u) {
  //   const a = document.createElement('a')
  //   a.href = u
  //   a.download = 'map.png'
  //   a.click()
  // }
  // console.log({du})
  // download(du)
  
  mapCanvas.toBlob((b) => {
    console.log({b})
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = 'map.png'
    a.click()
  }, 'image/png')
}
