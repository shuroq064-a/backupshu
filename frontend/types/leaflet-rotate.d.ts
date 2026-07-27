declare module "leaflet-rotate" {
  import * as L from "leaflet";
  module "leaflet" {
    interface MapOptions {
      rotate?: boolean;
      rotateControl?: false | object;
      pitch?: boolean;
    }
    interface Map {
      setBearing(bearing: number): Map;
      getBearing(): number;
    }
  }
}
