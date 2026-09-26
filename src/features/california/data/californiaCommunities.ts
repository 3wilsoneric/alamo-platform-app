import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { projectCaliforniaCoordinate } from "./californiaProjection";

export interface CaliforniaCommunity {
  facilityId: string;
  communityName: string;
  shortName: string;
  city: string;
  longitude: number;
  latitude: number;
  markerOffsetY?: number;
  mapX: number;
  mapY: number;
  labelX: number;
  labelY: number;
  labelAnchor: "start" | "end";
  elbowX: number;
  elbowY: number;
}

const MAP_POSITIONS: Record<
  string,
  Pick<
    CaliforniaCommunity,
    | "city"
    | "longitude"
    | "latitude"
    | "markerOffsetY"
    | "labelX"
    | "labelY"
    | "labelAnchor"
    | "elbowX"
    | "elbowY"
  >
> = {
  "337": {
    city: "San Pablo",
    longitude: -122.3456,
    latitude: 37.9622,
    markerOffsetY: -2,
    labelX: 270,
    labelY: 241,
    labelAnchor: "end",
    elbowX: 292,
    elbowY: 241
  },
  "342": {
    city: "San Francisco",
    longitude: -122.4194,
    latitude: 37.7749,
    markerOffsetY: 2,
    labelX: 270,
    labelY: 267,
    labelAnchor: "end",
    elbowX: 291,
    elbowY: 267
  },
  "343": {
    city: "San Bernardino",
    longitude: -117.2898,
    latitude: 34.1083,
    labelX: 442,
    labelY: 361,
    labelAnchor: "start",
    elbowX: 404,
    elbowY: 361
  },
  "344": {
    city: "Turlock",
    longitude: -120.849,
    latitude: 37.5057,
    labelX: 410,
    labelY: 270,
    labelAnchor: "start",
    elbowX: 360,
    elbowY: 270
  },
  "345": {
    city: "Santa Clarita",
    longitude: -118.5426,
    latitude: 34.3917,
    labelX: 292,
    labelY: 337,
    labelAnchor: "end",
    elbowX: 328,
    elbowY: 337
  }
};

export const CALIFORNIA_COMMUNITIES: CaliforniaCommunity[] = ALAMO_FACILITIES.map(
  (facility) => {
    const position = MAP_POSITIONS[facility.facilityId];
    if (!position) {
      throw new Error(`Missing California map position for facility ${facility.facilityId}.`);
    }
    const mapPoint = projectCaliforniaCoordinate(position.longitude, position.latitude);

    return {
      facilityId: facility.facilityId,
      communityName: facility.communityName,
      shortName: facility.shortName,
      ...position,
      mapX: mapPoint.x,
      mapY: mapPoint.y
    };
  }
);

export const CALIFORNIA_COMMUNITY_BY_ID = new Map(
  CALIFORNIA_COMMUNITIES.map((community) => [community.facilityId, community])
);
