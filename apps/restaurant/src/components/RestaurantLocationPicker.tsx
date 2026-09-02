import { useEffect, useMemo, useRef } from "react";
import type { Marker as LeafletMarker } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fixLeafletIcons } from "../lib/leafletIcons";

fixLeafletIcons();

interface Props {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  return null;
}

export default function RestaurantLocationPicker({ lat, lng, onChange }: Props) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const position = useMemo<[number, number]>(() => [lat, lng], [lat, lng]);

  return (
    <div className="restaurant-location-map">
      <MapContainer center={position} zoom={17} style={{ width: "100%", height: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <Recenter lat={lat} lng={lng} />
        <Marker
          draggable
          position={position}
          ref={markerRef}
          eventHandlers={{
            dragend: () => {
              const point = markerRef.current?.getLatLng();
              if (point) onChange(point.lat, point.lng);
            },
          }}
        >
          <Popup>Local exato da VAIPIZZA. Arraste o pino para corrigir.</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
