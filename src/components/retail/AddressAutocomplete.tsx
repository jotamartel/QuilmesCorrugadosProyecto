'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

// Extend Window for google maps
declare global {
  interface Window {
    google?: typeof google;
    __googleMapsCallback?: () => void;
  }
}

export interface ParsedAddress {
  direccion: string;       // Street + number
  ciudad: string;          // City / locality
  provincia: string;       // Province / state
  codigoPostal: string;    // Postal code
  formatted: string;       // Full formatted address
  lat?: number;
  lng?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: ParsedAddress) => void;
  placeholder?: string;
  hasError?: boolean;
  inputStyle?: React.CSSProperties;
  /** Restrict to CABA/AMBA area */
  restrictToAmba?: boolean;
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/** Check if Google Maps autocomplete is available */
export function isGoogleMapsAvailable(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

// Singleton: load Google Maps script once
let googleMapsLoading = false;
let googleMapsLoaded = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve) => {
    if (googleMapsLoaded && window.google?.maps?.places) {
      resolve();
      return;
    }

    loadCallbacks.push(resolve);

    if (googleMapsLoading) return;
    googleMapsLoading = true;

    window.__googleMapsCallback = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      loadCallbacks.forEach(cb => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=__googleMapsCallback`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

function parsePlace(place: google.maps.places.PlaceResult): ParsedAddress {
  const components = place.address_components || [];
  const get = (type: string): string => {
    const comp = components.find(c => c.types.includes(type));
    return comp?.long_name || '';
  };
  const getShort = (type: string): string => {
    const comp = components.find(c => c.types.includes(type));
    return comp?.short_name || '';
  };

  const streetNumber = get('street_number');
  const route = get('route');
  const direccion = streetNumber ? `${route} ${streetNumber}` : route;

  // City: try locality, then sublocality, then admin_area_level_2
  const ciudad = get('locality') || get('sublocality_level_1') || get('administrative_area_level_2');

  const provincia = get('administrative_area_level_1');
  const codigoPostal = get('postal_code');

  return {
    direccion: direccion.trim(),
    ciudad,
    provincia: provincia || 'Buenos Aires',
    codigoPostal,
    formatted: place.formatted_address || '',
    lat: place.geometry?.location?.lat(),
    lng: place.geometry?.location?.lng(),
  };
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Calle y numero',
  hasError,
  inputStyle,
  restrictToAmba = false,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);

  // Load Google Maps
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadGoogleMaps().then(() => setReady(true));
  }, []);

  // Initialize Autocomplete
  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const options: google.maps.places.AutocompleteOptions = {
      types: ['address'],
      componentRestrictions: { country: 'ar' }, // Argentina only
      fields: ['address_components', 'formatted_address', 'geometry'],
    };

    // Bias to Buenos Aires area if restricted
    if (restrictToAmba) {
      options.bounds = new google.maps.LatLngBounds(
        { lat: -35.0, lng: -59.2 },  // SW corner (south of AMBA)
        { lat: -34.3, lng: -58.1 },  // NE corner (north of CABA)
      );
      options.strictBounds = false; // bias, not restrict
    }

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, options);
    autocompleteRef.current = autocomplete;

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      const parsed = parsePlace(place);
      onSelect(parsed);
    });

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete);
      autocompleteRef.current = null;
    };
  // onSelect is intentionally excluded to prevent re-initialization
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, restrictToAmba]);

  // Handle manual typing
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  // Fallback: no API key — plain input
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <input
        type="text"
        value={value}
        onChange={handleChange}
        className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
        style={inputStyle}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
      className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
      style={inputStyle}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
