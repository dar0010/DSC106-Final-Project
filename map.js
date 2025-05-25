import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGFyMDA5IiwiYSI6ImNtYXI0ODUwbDA2eXgya29reHVlZjRkdHIifQ.XS8fk5IDe00_wwXmWsrT-A';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-86.7, 36.1],
  zoom: 10,
  minZoom: 5,
  maxZoom: 18,
});

let originalData;

// Parse "Date and Time" like "8/8/2020 6:15:00 AM" into minutes since midnight
function minutesSinceMidnight(dateTimeStr) {
  const parts = dateTimeStr.split(' ');
  if (parts.length !== 3) return null;

  const timePart = parts[1];
  const meridiem = parts[2];

  let [hours, minutes] = timePart.split(':').map(Number);

  if (meridiem === 'PM' && hours !== 12) {
    hours += 12;
  }
  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const displayHr = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${displayHr}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function filterFeaturesByTime(features, timeFilter) {
  if (timeFilter === -1) return features;

  return features.filter((feature) => {
    const dt = feature.properties['Date and Time'];
    if (!dt) return false;
    const mins = minutesSinceMidnight(dt);
    if (mins === null) return false;

    return Math.abs(mins - timeFilter) <= 60; // within ±60 minutes
  });
}

map.on('load', async () => {
  const response = await fetch('https://dar0010.github.io/nashville-crash-data/accidents.geojson');
  originalData = await response.json();

  map.addSource('nash-crash', {
    type: 'geojson',
    data: originalData,
  });

  map.addLayer({
    id: 'crashes',
    type: 'circle',
    source: 'nash-crash',
    paint: {
      'circle-color': 'red',
      'circle-opacity': 0.3,
      'circle-radius': 6,
    },
  });

  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    const timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }

    const filteredFeatures = filterFeaturesByTime(originalData.features, timeFilter);

    map.getSource('nash-crash').setData({
      type: 'FeatureCollection',
      features: filteredFeatures,
    });
  }

  timeSlider.addEventListener('input', updateTimeDisplay);

  updateTimeDisplay();
});