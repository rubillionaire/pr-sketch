// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - intial choo setup for the scroll
// - 01 adds tryptich using MapFillParent component for display that responds to css parent changes
// - 02
// - refactor the maps to be created based on name, so we can more easily
//    manage dealing with all maps as a group, and then individually as
//    necessary

var app = require('choo')()
var html = require('choo/html')
const mixmap = require('@rubenrodriguez/mixmap')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { createMap, createProps, createDraws, spreadProps } = require('./map')
const MapFillParent = require('./map-fill-parent')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const radiatingCoastlineOpts = {
  tick: 0,
}
const maps = []
const getMap = (name) => maps.find(m => m.name === name).map
const getDrawCmds = (name) => maps.find(m => m.name === name).drawCmds
const setLightPosictionTick = (name, state) => maps.find(m => m.name === name).updateLightPositionForTick(state)
const mapSpecs = [
  {
    name: 'cascadingTriptychDay',
    drawProps: { radiatingCoastlineOpts },
  },
  {
    name: 'cascadingTriptychTransition',
    drawProps: { radiatingCoastlineOpts },
  },
  {
    name: 'cascadingTriptychNight',
    drawProps: { radiatingCoastlineOpts },
  },
  {
    name: 'mapCycle',
    drawProps: {},
  },
  {
    name: 'mapFadingIn',
    drawProps: {},
  },
]

for (const { name, drawProps } of mapSpecs) {
  const { map } = createMap({ mix, name })
  const drawOpts = createDraws(Object.assign({ map }, drawProps))
  maps.push(Object.assign({ map, name }, drawOpts))
}

function mapScroll2 (state, emit) {
  return html`<body class=${prefix}>
    ${mix.render()}
    <main class="stack">
      <header class="bg-light">
        <hgroup class="p-8">
          <p class="text-dark">a map by <a class="text-dark" href="https://rubenrodriguez.me" target="_blank">rubén rodríguez</a></p>
          <h1 class="text-dark line-height-1">Puerto Rico</h1>
          <p class="text-dark">Terrain by day. City lights at night.</p>
        </hgroup>
      </header>

      <section id="cascading-triptych" class="box-border full-width p-4 bg-light">
        <div class="cascading-triptych-grid gap-4">
          <div class="triptychDay aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'cascadingTriptychDay').render({
                map: getMap('cascadingTriptychDay'),
                props: {
                  width: 0,
                  height: 0,
                  mouse: false,
                  attributes: {
                    class: 'map',
                  },
                }
              })}
          </div>
          <div class="triptychTransition aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'cascadingTriptychTransition').render({
                map: getMap('cascadingTriptychTransition'),
                props: {
                  width: 0,
                  height: 0,
                  mouse: false,
                  attributes: {
                    class: 'map',
                  },
                }
              })}
          </div>
          <div class="triptychNight aspect-pr overflow-hidden">
            ${state.cache(MapFillParent, 'cascadingTriptychNight').render({
                map: getMap('cascadingTriptychNight'),
                props: {
                  width: 0,
                  height: 0,
                  mouse: false,
                  attributes: {
                    class: 'map',
                  },
                }
              })}
          </div>
        </div>
      </section>

      <section id="map-fading-in" class="bg-light">
        ${getMap('mapFadingIn').render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>
      <section class="bg-light">
        ${getMap('mapCycle').render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>
    </main>
  </body>`
}
async function mapScroll2Store (state, emitter) {
  createProps({ map: maps[0].map }).then(({ props }) => {
    for (const { name } of mapSpecs) {
      const map = getMap(name)
      const draw = getDrawCmds(name)
      spreadProps({ map, draw, props })
    }
  })

  const fadeInRange = [1398, 1420]
  state.mapCycle = {
    tick: 0,
    playing: true
  }
  state.mapFadingIn = {
    tick: fadeInRange[0],
    tickRange: fadeInRange,
  }
  setLightPosictionTick('mapFadingIn', state.mapFadingIn)

  state.cascadingTriptychDay = { tick: 1600 }
  state.cascadingTriptychTransition = { tick: 1415 }
  state.cascadingTriptychNight = { tick: 1100 }
  setLightPosictionTick('cascadingTriptychDay', state.cascadingTriptychDay)
  setLightPosictionTick('cascadingTriptychTransition', state.cascadingTriptychTransition)
  setLightPosictionTick('cascadingTriptychNight', state.cascadingTriptychNight)

  emitter.on('DOMContentLoaded', () => {
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })

    frame()

    const mapFadeInProgress = trackProgress('map-fading-in', state.mapFadingIn)  
    mapFadeInProgress.scroll()
    window.addEventListener('scroll', () => {
      mapFadeInProgress.scroll()
    })
  })

  function frame () {
    setLightPosictionTick('mapCycle', state.mapCycle)
    setLightPosictionTick('mapFadingIn', state.mapFadingIn)
    mix.draw()
    state.mapCycle.tick += 1
    if (state.mapCycle.playing) window.requestAnimationFrame(frame)
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
function trackProgress (id, state) {
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
    const tick = lerp(state.tickRange[0], state.tickRange[1], travelPercent)
    state.tick = tick
  }

  return {
    resize,
    scroll,
  }
}