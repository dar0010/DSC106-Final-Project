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

let data;
let totalData;
let injuryFatalityData;
let selectedYear = 'all';
let selectedWeather = 'all';
let selectedHitRun = 'all';
let selectedIllumination = 'all';
let selectedDataset = 'total-accidents';
let activeStepElement = null;
let isScrolling = false;

// Property name mappings - will be populated after data loads
let propertyMappings = {
injuries: null,
fatalities: null,
vehicles: null,
weather: null,
hitRun: null,
illumination: null,
dateTime: null
};

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');
const dataDropDown = document.getElementById('dataset-select');
const yearDropDown = document.getElementById('year-select');
const weatherSelect = document.getElementById('weather-select');
const hitrunSelect = document.getElementById('hitrun-select');
const illumSelect = document.getElementById('illumination-select');

// Debug function to analyze property names
function analyzeProperties(features) {
if (!features || features.length === 0) return;

const sampleProps = features[0].properties;
console.log('Sample properties:', Object.keys(sampleProps));
console.log('First feature properties:', sampleProps);

const keys = Object.keys(sampleProps);

// Look for injury-related properties
const injuryKeys = keys.filter(key =>
    key.toLowerCase().includes('injury') ||
    key.toLowerCase().includes('injured')
);
// Prioritize keys with "count" in them to avoid picking a flag (e.g., "injury_flag: Y")
propertyMappings.injuries =
    injuryKeys.find(k => k.toLowerCase().includes('count')) ||
    injuryKeys[0] ||
    'Injury Count'; // Ultimate fallback

// Look for fatality-related properties
const fatalityKeys = keys.filter(key =>
    key.toLowerCase().includes('fatal') ||
    key.toLowerCase().includes('death') ||
    key.toLowerCase().includes('killed')
);
// Prioritize keys with "count"
propertyMappings.fatalities =
    fatalityKeys.find(k => k.toLowerCase().includes('count')) ||
    fatalityKeys[0] ||
    'Fatal Count';

// Look for vehicle-related properties
const vehicleKeys = keys.filter(key =>
    key.toLowerCase().includes('vehicle') ||
    key.toLowerCase().includes('motor')
);
// Prioritize keys with "number" or "count"
propertyMappings.vehicles =
    vehicleKeys.find(k => k.toLowerCase().includes('number') || k.toLowerCase().includes('count')) ||
    vehicleKeys[0] ||
    'Number of Motor Vehicles';


// Look for weather properties
const weatherKeys = keys.filter(key =>
    key.toLowerCase().includes('weather')
);

// Look for hit and run properties
const hitRunKeys = keys.filter(key =>
    key.toLowerCase().includes('hit') && key.toLowerCase().includes('run')
);

// Look for illumination properties
const illuminationKeys = keys.filter(key =>
    key.toLowerCase().includes('illumination') ||
    key.toLowerCase().includes('light')
);

// Look for date/time properties
const dateTimeKeys = keys.filter(key =>
    key.toLowerCase().includes('date') ||
    key.toLowerCase().includes('time')
);

// Set the mappings for non-numeric properties (original logic is fine here)
propertyMappings.weather = weatherKeys[0] || 'Weather';
propertyMappings.hitRun = hitRunKeys[0] || 'Hit and Run';
propertyMappings.illumination = illuminationKeys[0] || 'Illumination Description';
propertyMappings.dateTime = dateTimeKeys[0] || 'Date and Time';

console.log('Final property mappings:', propertyMappings);
}


// Enhanced helper to get numeric properties
function getNumericProperty(props, primaryKey, fallbackKey) {
// First try the mapped property name
const mappedKey = propertyMappings[primaryKey];
if (mappedKey && props[mappedKey] !== undefined) {
    const value = parseInt(props[mappedKey]) || 0;
    return value;
}

// Try the original primary key
if (props[primaryKey] !== undefined) {
    const value = parseInt(props[primaryKey]) || 0;
    return value;
}

// Try the fallback key
if (fallbackKey && props[fallbackKey] !== undefined) {
    const value = parseInt(props[fallbackKey]) || 0;
    return value;
}

return 0;
}

// Enhanced helper to get string properties
function getStringProperty(props, primaryKey, fallbackKey) {
const mappedKey = propertyMappings[primaryKey];
if (mappedKey && props[mappedKey] !== undefined) {
return props[mappedKey];
}

if (props[primaryKey] !== undefined) {
return props[primaryKey];
}

if (fallbackKey && props[fallbackKey] !== undefined) {
return props[fallbackKey];
}

return '';
}

function extractYear(dateTimeStr) {
if (!dateTimeStr) return null;
const datePart = dateTimeStr.split(' ')[0];
return datePart ? new Date(datePart).getFullYear() : null;
}

function minutesSinceMidnight(dateTimeStr) {
if (!dateTimeStr) return null;
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
const dt = getStringProperty(props, 'dateTime', 'Date and Time');
if (!dt) return false;

const yearMatch = year === 'all' || extractYear(dt) === parseInt(year);
const mins = minutesSinceMidnight(dt);
const timeMatch = timeFilter === -1 || (mins !== null && Math.abs(mins - timeFilter) <= 60);

const weatherVal = getStringProperty(props, 'weather', 'Weather Description') || '';
const weatherMatch = weather === 'all' || weatherVal.toUpperCase() === weather;

const hrVal = (getStringProperty(props, 'hitRun', 'Hit and Run Flag') || '').toUpperCase();
const hitRunMatch = hitRun === 'all' || hrVal === hitRun;

const illumVal = getStringProperty(props, 'illumination', 'Illumination Description');
const illuminationMatch =
  illumination === 'all' ||
  (illumVal && illumVal.toUpperCase().trim() === illumination.toUpperCase().trim());

return yearMatch && timeMatch && weatherMatch && hitRunMatch && illuminationMatch;
});
}

function updateStepStats(filteredFeatures) {
if (!activeStepElement) return;

const crashCount = filteredFeatures.length;

// Use the enhanced property getter with proper mapping
const injuryCount = filteredFeatures.reduce((sum, f) => {
const injuries = getNumericProperty(f.properties, 'injuries', 'sum_injury_count');
return sum + injuries;
}, 0);

const fatalityCount = filteredFeatures.reduce((sum, f) => {
const fatalities = getNumericProperty(f.properties, 'fatalities', 'sum_fatal_count');
return sum + fatalities;
}, 0);

console.log(`Stats for ${crashCount} crashes: ${injuryCount} injuries, ${fatalityCount} fatalities`);

const crashEl = activeStepElement.querySelector('.stat-crashes');
const injuryEl = activeStepElement.querySelector('.stat-injuries');
const fatalityEl = activeStepElement.querySelector('.stat-fatalities');

if (crashEl) crashEl.textContent = crashCount.toLocaleString();
if (injuryEl) injuryEl.textContent = injuryCount.toLocaleString();
if (fatalityEl) fatalityEl.textContent = fatalityCount.toLocaleString();
}

function updateStepNarrative() {
if (!activeStepElement) return;

const narrativeEl = activeStepElement.querySelector('.dynamic-narrative');
if (!narrativeEl) return;

const timeFilter = Number(timeSlider.value);
let descriptions = [];

if (selectedWeather !== 'all') descriptions.push(`weather is <strong>${selectedWeather}</strong>`);
if (selectedIllumination !== 'all') descriptions.push(`illumination is <strong>${selectedIllumination}</strong>`);
if (selectedHitRun !== 'all') descriptions.push(`hit & run is <strong>${selectedHitRun === 'Y' ? 'Yes' : 'No'}</strong>`);
if (timeFilter !== -1) descriptions.push(`time is around <strong>${formatTime(timeFilter)}</strong>`);

if (descriptions.length > 0) {
    narrativeEl.innerHTML = `<em>Currently filtered by: ${descriptions.join(', ')}.</em>`;
} else {
    narrativeEl.innerHTML = `<em>Use the filters above to explore this data in more detail.</em>`;
}
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

if (selectedDataset === 'injury-fatality') {
map.setLayoutProperty('total-accidents', 'visibility', 'none');
map.setLayoutProperty('injury-fatality', 'visibility', 'visible');
data = injuryFatalityData;
} else {
map.setLayoutProperty('total-accidents', 'visibility', 'visible');
map.setLayoutProperty('injury-fatality', 'visibility', 'none');
data = totalData;
}

const filtered = filterFeatures(
data.features,
selectedYear,
timeFilter,
selectedWeather,
selectedHitRun,
selectedIllumination
);

const sourceName = selectedDataset;
map.getSource(sourceName).setData({
type: 'FeatureCollection',
features: filtered,
});

updateStepStats(filtered);
updateStepNarrative();
}

map.on('load', async () => {
try {
console.log('Loading data...');
const response_injury = await fetch('https://dar0010.github.io/nashville-crash-data/accidents_injury_fatality.geojson');
const response_total = await fetch('https://dar0010.github.io/nashville-crash-data/accidents_excluded.geojson');

if (!response_injury.ok || !response_total.ok) {
  throw new Error('Failed to fetch data');
}

injuryFatalityData = await response_injury.json();
totalData = await response_total.json();

console.log('Data loaded successfully');
console.log('Total accidents:', totalData.features.length);
console.log('Injury/fatality accidents:', injuryFatalityData.features.length);

// Analyze properties from both datasets
console.log('=== ANALYZING TOTAL ACCIDENTS DATA ===');
analyzeProperties(totalData.features);

console.log('=== ANALYZING INJURY/FATALITY DATA ===');
analyzeProperties(injuryFatalityData.features);

map.addSource('total-accidents', { type: 'geojson', data: totalData });
map.addSource('injury-fatality', { type: 'geojson', data: injuryFatalityData });

const circlePaintConfig = {
  'circle-color': '#d22f27',
  'circle-opacity': 0.35,
  'circle-radius': [
    'interpolate', ['linear'], ['get', propertyMappings.vehicles || 'Number of Motor Vehicles'],
    1, 4, 2, 6, 3, 8, 4, 10, 5, 12, 6, 14
  ]
};

map.addLayer({ id: 'total-accidents', type: 'circle', source: 'total-accidents', paint: circlePaintConfig });
map.addLayer({ id: 'injury-fatality', type: 'circle', source: 'injury-fatality', layout: { visibility: 'none' }, paint: circlePaintConfig });

const years = [...new Set(totalData.features.map(f => {
  const dt = getStringProperty(f.properties, 'dateTime', 'Date and Time');
  return extractYear(dt);
}).filter(y => y))].sort();

yearDropDown.innerHTML = `<option value="all">All Years</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}`;

yearDropDown.addEventListener('change', () => {
  if (isScrolling) return; 

  selectedYear = yearDropDown.value;
  const storyYears = ['all', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  const targetStepIndex = storyYears.indexOf(selectedYear);
  
  if (targetStepIndex > -1) {
      const targetEl = document.querySelector(`.step[data-step="${targetStepIndex}"]`);
      if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  } else {
      updateFilters(); 
  }
});

weatherSelect.addEventListener('change', () => { selectedWeather = weatherSelect.value; updateFilters(); });
hitrunSelect.addEventListener('change', () => { selectedHitRun = hitrunSelect.value; updateFilters(); });
illumSelect.addEventListener('change', () => { selectedIllumination = illumSelect.value; updateFilters(); });
dataDropDown.addEventListener('change', () => { selectedDataset = dataDropDown.value; updateFilters(); });
timeSlider.addEventListener('input', updateFilters);

// Enhanced popup with proper property mapping
['total-accidents', 'injury-fatality'].forEach(layerId => {
  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const props = feature.properties;
    const coords = feature.geometry.coordinates;
    
    const injuries = getNumericProperty(props, 'injuries', 'sum_injury_count');
    const fatalities = getNumericProperty(props, 'fatalities', 'sum_fatal_count');
    const vehicles = getNumericProperty(props, 'vehicles', 'Number of Motor Vehicles');
    const dateTime = getStringProperty(props, 'dateTime', 'Date and Time');
    const weather = getStringProperty(props, 'weather', 'Weather Description');
    const hitRun = getStringProperty(props, 'hitRun', 'Hit and Run Flag');

    console.log('Popup data:', { injuries, fatalities, vehicles, dateTime, weather, hitRun });

    new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
      .setLngLat(coords)
      .setHTML(`
        <strong>Time:</strong> ${dateTime || 'N/A'}<br>
        <strong>Vehicles:</strong> ${vehicles}<br>
        <strong>Injuries:</strong> ${injuries}<br>
        <strong>Fatalities:</strong> ${fatalities}<br>
        <strong>Weather:</strong> ${weather || 'N/A'}<br>
        <strong>Hit & Run:</strong> ${hitRun || 'N/A'}
      `)
      .addTo(map);
  });

  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
    const popups = document.getElementsByClassName('mapboxgl-popup');
    if (popups.length) popups[0].remove();
  });
});

const scroller = scrollama();
scroller
  .setup({
    step: '.step',
    offset: 0.5,
    debug: false,
  })
  .onStepEnter(({ element, index }) => {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('is-active'));
    element.classList.add('is-active');
    activeStepElement = element;

    const storyYears = ['all', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    selectedYear = storyYears[index] || 'all';
    selectedDataset = (index === 0) ? 'total-accidents' : 'injury-fatality';
    
    isScrolling = true;
    yearDropDown.value = selectedYear;
    dataDropDown.value = selectedDataset;
    requestAnimationFrame(() => { isScrolling = false; });

    updateFilters();
  });

window.addEventListener('resize', scroller.resize);

const initialStep = document.querySelector('.step[data-step="0"]');
if(initialStep) {
  initialStep.classList.add('is-active');
  activeStepElement = initialStep;
}

data = totalData; // Set initial data
updateFilters();

} catch (error) {
console.error('Error loading data:', error);
}
});