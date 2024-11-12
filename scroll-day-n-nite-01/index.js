// scroll-day-n-nite
// - fork of radiating-coastline-16
// - build note, uses `glsl-georender-style-texture`  @ 4.0.2
// - 00
// - intial choo setup for the scroll
// - 01 adds tryptich using MapFillParent component for display that responds to css parent changes

var app = require('choo')()
var html = require('choo/html')
const mixmap = require('@rubenrodriguez/mixmap')
const fs = require('fs')
const regl = require('regl')
const css = require('sheetify')
const { create, config } = require('./map')
const MapFillParent = require('./map-fill-parent')
const lerp = require('../util/lerp')

const prefix = css('./style.css')

const mix = mixmap(regl, {
  extensions: ['oes_element_index_uint'],
})

const mapFadingIn = create({ mix })
const mapCycle = create({ mix })
const cascadingTriptychDay = create({ mix })
const cascadingTriptychTransition = create({ mix })
const cascadingTriptychNight = create({ mix })

const radiatingCoastlineOpts = {
  tick: 0,
}

const mapFadingInConfig = config({ map: mapFadingIn })
const mapCycleConfig = config({ map: mapCycle })
const cascadingTriptychDayConfig = config({ map: cascadingTriptychDay, radiatingCoastlineOpts })
const cascadingTriptychTransitionConfig = config({ map: cascadingTriptychTransition, radiatingCoastlineOpts })
const cascadingTriptychNightConfig = config({ map: cascadingTriptychNight, radiatingCoastlineOpts })

function mapScroll (state, emit) {
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
                map: cascadingTriptychDay,
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
                map: cascadingTriptychTransition,
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
                map: cascadingTriptychNight,
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
        ${mapFadingIn.render({
          width: window.innerWidth,
          height: window.innerHeight,
          mouse: false,
          attributes: {
            class: 'map',
          },
        })}
      </section>
      <section class="bg-light">
        ${mapCycle.render({
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

app.route('/', mapScroll)
app.route('/*', mapScroll)

app.use(function (state, emitter) {
  const fadeInRange = [1398, 1420]
  state.cycle = { tick: 0 }
  state.fadeIn = {
    tick: fadeInRange[0],
    tickRange: fadeInRange
  }
  state.cascadingTriptychDay = { tick: 1600 }
  state.cascadingTriptychTransition = { tick: 1415 }
  state.cascadingTriptychNight = { tick: 1100 }
  state.playing = true
  
  cascadingTriptychDayConfig.updateLightPositionForTick(state.cascadingTriptychDay)
  cascadingTriptychTransitionConfig.updateLightPositionForTick(state.cascadingTriptychTransition)
  cascadingTriptychNightConfig.updateLightPositionForTick(state.cascadingTriptychNight)
  mapFadingInConfig.updateLightPositionForTick({ tick: state.tickFadeIn })
  
  emitter.on('DOMContentLoaded', () => {   // 2.
    window.addEventListener('resize', function () {
      emitter.emit('render')
    })
    frame(state)

    const mapFadeInProgress = trackProgress('map-fading-in', state.fadeIn)  
    mapFadeInProgress.scroll()

    window.addEventListener('scroll', () => {
      mapFadeInProgress.scroll()
    })

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

    // const intersectionObserver = new IntersectionObserver((entries) => {
    //   console.log({entries});
    // });
    // intersectionObserver.observe(document.getElementById("map-fading-in"))
  })

  function frame () {
    mapCycleConfig.updateLightPositionForTick(state.cycle)
    mapFadingInConfig.updateLightPositionForTick(state.fadeIn)
    mix.draw()
    state.cycle.tick += 1
    if (state.playing) window.requestAnimationFrame(frame)
  }
})

app.mount('body')
