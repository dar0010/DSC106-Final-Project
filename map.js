// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGFyMDA5IiwiYSI6ImNtYXI0ODUwbDA2eXgya29reHVlZjRkdHIifQ.XS8fk5IDe00_wwXmWsrT-A';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-86.7, 36.1], // [longitude, latitude]
  zoom: 10, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {
    map.addSource('nash-crash', {
        type: 'geojson',
        data: 'https://dar0010.github.io/nashville-crash-data/accidents.geojson'
    });

    map.addLayer({
        id: 'crashes',
        type: 'circle',
        source: 'nash-crash',
        paint: {
            'circle-color': 'red',
            'circle-opacity': 0.3,
        }
    });
});