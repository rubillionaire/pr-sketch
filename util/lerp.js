module.exports = function lerp (start, end, percent) {
  if (percent > 1.0) percent = 1.0
  if (percent < 0.0) percent = 0.0
  return (1.0 - percent) * start + (percent * end)
}
