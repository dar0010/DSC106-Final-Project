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

let totalData;
let injuryFatalityData;
let selectedDataset = 'total-accidents';
let selectedYear = 'all';
let selectedWeather = 'all';
let selectedHitRun = 'all';
let selectedIllumination = 'all';
let selectedDataset = 'total-accidents';

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');
const datasetSelect = document.getElementById('dataset-select');
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

    const yearMatch = year === 'all' || extractYear(dt) === parseInt(year);
    const mins = minutesSinceMidnight(dt);
    const timeMatch = timeFilter === -1 || (mins !== null && Math.abs(mins - timeFilter) <= 60);
    const weatherVal = props['Weather'] || props['Weather Description'] || '';
    const weatherMatch = weather === 'all' || weatherVal.toUpperCase() === weather;
    const hrVal = (props['Hit and Run'] || props['Hit and Run Flag'] || '').toUpperCase();
    const hitRunMatch = hitRun === 'all' || hrVal === hitRun;
    const illumVal = props['Illumination'] || props['Illumination Condition'] || props['Illumination Description'] || '';
    const illuminationMatch = illumination === 'all' || illumVal.toUpperCase().trim() === illumination.toUpperCase().trim();

    return yearMatch && timeMatch && weatherMatch && hitRunMatch && illuminationMatch;
  });
}
function updateYearSummary(features, year) {
  const fatalities = features.reduce((sum, f) => sum + (parseInt(f.properties['Fatal Count']) || 0), 0);
  const injuries = features.reduce((sum, f) => sum + (parseInt(f.properties['Injury Count']) || 0), 0);

  document.getElementById('summary-year').textContent = year;
  document.getElementById('summary-fatalities').textContent = fatalities;
  document.getElementById('summary-injuries').textContent = injuries;
}


function updateFilters() {
  const timeFilter = Number(timeSlider.value);
  selectedTime.textContent = timeFilter === -1 ? '' : formatTime(timeFilter);
  anyTimeLabel.style.display = timeFilter === -1 ? 'block' : 'none';

  const dataset = selectedDataset === 'injury-fatality' ? injuryFatalityData : totalData;
  const filtered = filterFeatures(dataset.features, selectedYear, timeFilter, selectedWeather, selectedHitRun, selectedIllumination);

  map.getSource('nash-crash').setData({
    type: 'FeatureCollection',
    features: filtered,
  });
  
}

map.on('load', async () => {
  const [respInjury, respTotal] = await Promise.all([
    fetch('https://dar0010.github.io/nashville-crash-data/accidents_injury_fatality.geojson'),
    fetch('https://dar0010.github.io/nashville-crash-data/accidents.geojson')
  ]);
  injuryFatalityData = await respInjury.json();
  totalData = await respTotal.json();

  // Add source and layer (your existing code)
  map.addSource('nash-crash', {
    type: 'geojson',
    data: totalData,
  });

  map.addLayer({
    id: 'crashes',
    type: 'circle',
    source: 'nash-crash',
    paint: {
      'circle-color': 'red',
      'circle-opacity': 0.25,
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'Number of Motor Vehicles'],
        1, 4, 2, 6, 3, 8, 4, 10, 5, 12, 6, 14
      ]
    },
  });

  // Your existing filter dropdowns, popup, etc.

  // --- NEW: aggregate yearly stats and update .step divs ---

  const yearlyStats = {};

  // Aggregate fatalities and injuries per year
  originalData.features.forEach(f => {
    const year = extractYear(f.properties['Date and Time']);
    if (!year) return;
  
    const fatal = parseInt(f.properties['Number of Fatalities']) || 0;
    const inj = parseInt(f.properties['Number of Injuries']) || 0;
  
    if (!yearlyStats[year]) yearlyStats[year] = { fatalities: 0, injuries: 0 };
    yearlyStats[year].fatalities += fatal;
    yearlyStats[year].injuries += inj;
  });

  // Update each .step div with the stats
  document.querySelectorAll('.step').forEach((stepEl, idx) => {
    const year = 2018 + idx; // Adjust if your years start differently
    const stats = yearlyStats[year] || { fatalities: 0, injuries: 0 };
    stepEl.innerHTML = `
      <strong>${year}</strong><br>
      Fatalities: ${stats.fatalities}<br>
      Injuries: ${stats.injuries}
    `;
  });

  // Scrollama setup and other logic continues here...
  const scroller = scrollama();
  scroller.setup({ step: '.step', offset: 0.5, debug: false })
    .onStepEnter(({ element, index }) => {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('is-active'));
      element.classList.add('is-active');

      selectedYear = index === 8 ? 'all' : (2017 + index).toString();
      yearDropDown.value = selectedYear;
      updateFilters();

      window.addEventListener('resize', scroller.resize);
    });

  updateFilters();
});
