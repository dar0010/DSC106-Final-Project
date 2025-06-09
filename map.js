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

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');
const dataDropDown = document.getElementById('dataset-select');
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
    const illumVal = props['Illumination Description'];
    const illuminationMatch =
      illumination === 'all' ||
      (illumVal && illumVal.toUpperCase().trim() === illumination.toUpperCase().trim());

    return yearMatch && timeMatch && weatherMatch && hitRunMatch && illuminationMatch;
  });
}

// FIX: Corrected property names for injury and fatal counts based on provided column names
function updateStepStats(filteredFeatures) {
  if (!activeStepElement) return;

  const crashCount = filteredFeatures.length;
  // Use 'Number of Injuries' and 'Number of Fatalities' as primary, fallback to 'sum_injury_count' etc.
  const injuryCount = filteredFeatures.reduce((sum, f) => {
    const props = f.properties;
    return sum + (parseInt(props['Number of Injuries']) || parseInt(props['sum_injury_count']) || 0);
  }, 0);
  const fatalityCount = filteredFeatures.reduce((sum, f) => {
    const props = f.properties;
    return sum + (parseInt(props['Number of Fatalities']) || parseInt(props['sum_fatal_count']) || 0);
  }, 0);
  
  const crashEl = activeStepElement.querySelector('.stat-crashes');
  const injuryEl = activeStepElement.querySelector('.stat-injuries');
  const fatalityEl = activeStepElement.querySelector('.stat-fatalities');

  if (crashEl) crashEl.textContent = crashCount.toLocaleString();
  if (injuryEl) injuryEl.textContent = injuryCount.toLocaleString();
  if (fatalityEl) fatalityEl.textContent = fatalityCount.toLocaleString();
}

// NEW: Function to update the narrative text based on filters
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
        narrativeEl.innerHTML = `Currently filtered by: ${descriptions.join(', ')}.`;
    } else {
        narrativeEl.innerHTML = `Use the filters above to explore this data in more detail.`;
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
  updateStepNarrative(); // Call the new narrative function
}

map.on('load', async () => {
  const response_injury = await fetch('https://dar0010.github.io/nashville-crash-data/accidents_injury_fatality.geojson');
  const response_total = await fetch('https://dar0010.github.io/nashville-crash-data/accidents.geojson');
  injuryFatalityData = await response_injury.json();
  totalData = await response_total.json();

  map.addSource('total-accidents', { type: 'geojson', data: totalData });
  map.addSource('injury-fatality', { type: 'geojson', data: injuryFatalityData });

  const circlePaintConfig = {
    'circle-color': '#d22f27',
    'circle-opacity': 0.35,
    'circle-radius': [
      'interpolate', ['linear'], ['get', 'Number of Motor Vehicles'],
      1, 4, 2, 6, 3, 8, 4, 10, 5, 12, 6, 14
    ]
  };

  map.addLayer({ id: 'total-accidents', type: 'circle', source: 'total-accidents', paint: circlePaintConfig });
  map.addLayer({ id: 'injury-fatality', type: 'circle', source: 'injury-fatality', layout: { visibility: 'none' }, paint: circlePaintConfig });

  const years = [...new Set(totalData.features.map(f => extractYear(f.properties['Date and Time'])).filter(y => y))].sort();
  yearDropDown.innerHTML = `<option value="all">All Years</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}`;

  // EVENT LISTENERS
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

  // POPUP ON HOVER
  ['total-accidents', 'injury-fatality'].forEach(layerId => {
    map.on('mouseenter', layerId, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates;

      new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(coords)
        .setHTML(`
          <strong>Time:</strong> ${props['Date and Time']}<br>
          <strong>Vehicles:</strong> ${props['Number of Motor Vehicles']}<br>
          <strong>Injuries:</strong> ${props['Number of Injuries'] || props['sum_injury_count'] || 0}<br>
          <strong>Fatalities:</strong> ${props['Number of Fatalities'] || props['sum_fatal_count'] || 0}<br>
          <strong>Weather:</strong> ${props['Weather'] || props['Weather Description'] || 'N/A'}<br>
          <strong>Hit & Run:</strong> ${props['Hit and Run'] || props['Hit and Run Flag'] || 'N/A'}
        `)
        .addTo(map);
    });

    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = '';
      const popups = document.getElementsByClassName('mapboxgl-popup');
      if (popups.length) popups[0].remove();
    });
  });

  // SCROLLAMA SETUP
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
  
  updateFilters();
});