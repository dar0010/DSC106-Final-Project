import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

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
let selectedYear = 'all';
let selectedWeather = 'all';
let selectedHitRun = 'all';
let selectedIllumination = 'all';

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

const yearDropDown = document.getElementById('year-select');
const weatherSelect = document.getElementById('weather-select');
const hitrunSelect = document.getElementById('hitrun-select');
const illumSelect = document.getElementById('illumination-select');

function extractYear(dateTimeStr) {
  const datePart = dateTimeStr?.split(' ')[0];
  return datePart ? new Date(datePart).getFullYear() : null;
}

function minutesSinceMidnight(dateTimeStr) {
  const parts = dateTimeStr.split(' ');
  if (parts.length !== 3) return null;
  const timePart = parts[1];
  const meridiem = parts[2];
  let [hours, minutes] = timePart.split(':').map(Number);
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const displayHr = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${displayHr}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function filterFeatures(features, year, timeFilter, weather, hitRun, illumination) {
  return features.filter((feature) => {
    const props = feature.properties;
    const dt = props['Date and Time'];
    if (!dt) return false;

    // Year filter
    const yearMatch = year === 'all' || extractYear(dt) === parseInt(year);

    // Time filter: allow ±60 minutes around the chosen slider value
    const mins = minutesSinceMidnight(dt);
    const timeMatch = timeFilter === -1 || (mins !== null && Math.abs(mins - timeFilter) <= 60);

    // Weather filter (uppercase compare)
    const weatherVal = props['Weather'] || props['Weather Description'] || '';
    const weatherMatch = weather === 'all' || weatherVal.toUpperCase() === weather;

    // Hit-and-Run filter (uppercase compare)
    const hrVal = (props['Hit and Run'] || props['Hit and Run Flag'] || '').toUpperCase();
    const hitRunMatch = hitRun === 'all' || hrVal === hitRun;

    // Illumination filter (uppercase compare)
    const illumVal = props['Illumination'] || props['Illumination Condition'] || '';
    const illuminationMatch = illumination === 'all' || illumVal.toUpperCase() === illumination;

    return yearMatch && timeMatch && weatherMatch && hitRunMatch && illuminationMatch;
  });
}

function updateFilters() {
  const timeFilter = Number(timeSlider.value);
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }

  const filtered = filterFeatures(
    originalData.features,
    selectedYear,
    timeFilter,
    selectedWeather,
    selectedHitRun,
    selectedIllumination
  );

  map.getSource('nash-crash').setData({
    type: 'FeatureCollection',
    features: filtered,
  });
}

map.on('load', async () => {
  // Fetch and store the GeoJSON
  const response = await fetch(
    'https://dar0010.github.io/nashville-crash-data/accidents_injury_fatality.geojson'
  );
  originalData = await response.json();

  // Add GeoJSON source
  map.addSource('nash-crash', {
    type: 'geojson',
    data: originalData,
  });

  // Add circle layer
  map.addLayer({
    id: 'crashes',
    type: 'circle',
    source: 'nash-crash',
    paint: {
      'circle-color': 'red',
      'circle-opacity': 0.3,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['get', 'Number of Motor Vehicles'],
        1, 4,
        2, 6,
        3, 8,
        4, 10,
        5, 12,
        6, 14
      ]
    },
  });

  // Populate the year dropdown with all distinct years
  const years = [
    ...new Set(
      originalData.features
        .map(f => extractYear(f.properties['Date and Time']))
        .filter(y => y)
    )
  ].sort();
  yearDropDown.innerHTML = `
    <option value="all">All Years</option>
    ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
  `;

  // Attach event listeners for filter controls
  yearDropDown.addEventListener('change', () => {
    selectedYear = yearDropDown.value;
    updateFilters();
  });

  weatherSelect.addEventListener('change', () => {
    selectedWeather = weatherSelect.value;
    updateFilters();
  });

  hitrunSelect.addEventListener('change', () => {
    selectedHitRun = hitrunSelect.value;
    updateFilters();
  });

  illumSelect.addEventListener('change', () => {
    selectedIllumination = illumSelect.value;
    updateFilters();
  });

  // Popup on hover for each crash circle
  map.on('mouseenter', 'crashes', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const props = feature.properties;
    const coords = feature.geometry.coordinates;

    const time = props['Date and Time'];
    const vehicles = props['Number of Motor Vehicles'];
    const type = props['Collision Type Description'];
    const weather = props['Weather'] || props['Weather Description'];
    const hitrun = props['Hit and Run'] || props['Hit and Run Flag'];
    const illum = props['Illumination'] || props['Illumination Condition'];

    new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
      .setLngLat(coords)
      .setHTML(`
        <strong>Time:</strong> ${time}<br>
        <strong>Vehicles:</strong> ${vehicles}<br>
        <strong>Type:</strong> ${type}<br>
        <strong>Weather:</strong> ${weather || 'N/A'}<br>
        <strong>Hit & Run:</strong> ${hitrun || 'N/A'}<br>
        <strong>Light:</strong> ${illum || 'N/A'}
      `)
      .addTo(map);
  });

  map.on('mouseleave', 'crashes', () => {
    map.getCanvas().style.cursor = '';
    const popups = document.getElementsByClassName('mapboxgl-popup');
    if (popups.length) popups[0].remove();
  });

  // Time slider input listener
  timeSlider.addEventListener('input', updateFilters);

  // Scrollama setup
  const scroller = scrollama();
  scroller
    .setup({
      step: '.step',
      offset: 0.5,
      debug: false,
    })
    .onStepEnter(({ element, index }) => {
      // Highlight the active step
      document.querySelectorAll('.step').forEach(s => s.classList.remove('is-active'));
      element.classList.add('is-active');

      // Determine year based on scroll index
      if (index === 0) {
        selectedYear = '2018';
      } else if (index === 1) {
        selectedYear = '2019';
      } else if (index === 2) {
        selectedYear = '2020';
      } else if (index === 3) {
        selectedYear = '2021';
      } else if (index === 4) {
        selectedYear = '2022';
      } else if (index === 5) {
        selectedYear = '2023';
      } else if (index === 6) {
        selectedYear = '2024';
      } else {
        selectedYear = '2025';
      }

      yearDropDown.value = selectedYear;

      // Re-draw the map with updated filters
      updateFilters();

      // Re-calc positions if window resizes
      window.addEventListener('resize', scroller.resize);
    });

  // Initial draw (all filters set to “all”)
  updateFilters();
});
