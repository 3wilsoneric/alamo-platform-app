export interface CaliforniaMapPoint {
  x: number;
  y: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

// The source map uses the standard contiguous-US Albers equal-area projection.
const STANDARD_PARALLEL_NORTH = 29.5 * DEGREES_TO_RADIANS;
const STANDARD_PARALLEL_SOUTH = 45.5 * DEGREES_TO_RADIANS;
const PROJECTION_ROTATION = 96;
const PROJECTION_CENTER_LONGITUDE = -0.6;
const PROJECTION_CENTER_LATITUDE = 38.7;
const PROJECTION_SCALE = 1070;
const PROJECTION_TRANSLATE_X = 480;
const PROJECTION_TRANSLATE_Y = 250;

const projectionN =
  (Math.sin(STANDARD_PARALLEL_NORTH) + Math.sin(STANDARD_PARALLEL_SOUTH)) / 2;
const projectionC =
  1 +
  Math.sin(STANDARD_PARALLEL_NORTH) *
    (2 * projectionN - Math.sin(STANDARD_PARALLEL_NORTH));
const projectionR0 = Math.sqrt(projectionC) / projectionN;

// Calibrated against California's four state-border corners in the source SVG.
const SVG_X_FROM_ALBERS = {
  x: 1.2083962682291183,
  y: -0.007536170397999364,
  offset: 177.7974044750713
};
const SVG_Y_FROM_ALBERS = {
  x: 0.020647592851066966,
  y: 1.1822909840636264,
  offset: -2.110652147576449
};

function projectAlbersRaw(longitudeRadians: number, latitudeRadians: number) {
  const radius =
    Math.sqrt(projectionC - 2 * projectionN * Math.sin(latitudeRadians)) /
    projectionN;
  const longitude = longitudeRadians * projectionN;

  return {
    x: radius * Math.sin(longitude),
    y: projectionR0 - radius * Math.cos(longitude)
  };
}

function projectContiguousUnitedStates(longitude: number, latitude: number) {
  const center = projectAlbersRaw(
    PROJECTION_CENTER_LONGITUDE * DEGREES_TO_RADIANS,
    PROJECTION_CENTER_LATITUDE * DEGREES_TO_RADIANS
  );
  const projected = projectAlbersRaw(
    (longitude + PROJECTION_ROTATION) * DEGREES_TO_RADIANS,
    latitude * DEGREES_TO_RADIANS
  );

  return {
    x:
      PROJECTION_TRANSLATE_X +
      PROJECTION_SCALE * (projected.x - center.x),
    y:
      PROJECTION_TRANSLATE_Y -
      PROJECTION_SCALE * (projected.y - center.y)
  };
}

export function projectCaliforniaCoordinate(
  longitude: number,
  latitude: number
): CaliforniaMapPoint {
  const projected = projectContiguousUnitedStates(longitude, latitude);

  return {
    x:
      projected.x * SVG_X_FROM_ALBERS.x +
      projected.y * SVG_X_FROM_ALBERS.y +
      SVG_X_FROM_ALBERS.offset,
    y:
      projected.x * SVG_Y_FROM_ALBERS.x +
      projected.y * SVG_Y_FROM_ALBERS.y +
      SVG_Y_FROM_ALBERS.offset
  };
}
