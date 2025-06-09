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

// State variables
let data;
let totalData;
let injuryFatalityData;
let selectedYear = 'all';
let selectedWeather = 'all';
let selectedHitRun = 'all';
let selectedIllumination = 'all';
let selectedDataset = 'total-accidents'; // Initial dataset
let activeStepElement = null;
let isScrolling = false; // Flag to prevent event feedback loops

// DOM Elements
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');
const dataDropDown = document.getElementById('dataset-select');
const yearDropDown = document.getElementById('year-select');
const weatherSelect = document.getElementById('weather-select');
const hitrunSelect = document.getElementById('hitrun-select');
const illumSelect = document.getElementById('illumination-select');

// Helper function to extract year from a "MM/DD/YYYY HH:MM AM/PM" string
function extractYear(dateTimeStr) {
  const datePart = dateTimeStr?.split(' ')[0];
  return datePart ? new Date(datePart).getFullYear() : null;
}

// Helper function to convert time string to minutes since midnight
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

// Helper function to format minutes back to a displayable time string
function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  const displayHr = hrs % 12 === 0 ? 12 : hrs % 12;
  return `${displayHr}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

// Main filtering function
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

// Updates the statistics in the active narrative step
function updateStepStats(filteredFeatures) {
  if (!activeStepElement) return;

  const crashCount = filteredFeatures.length;
  // Use robust property checking for injuries and fatalities across both datasets
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

// Updates the dynamic narrative text in the active step
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

// Central function to update all visual elements based on current filter state
function updateFilters() {
  const timeFilter = Number(timeSlider.value);
  
  // Update time slider display
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }

  // Set layer visibility and select the correct data source based on the dropdown
  if (selectedDataset === 'injury-fatality') {
    map.setLayoutProperty('total-accidents', 'visibility', 'none');
    map.setLayoutProperty('injury-fatality', 'visibility', 'visible');
    data = injuryFatalityData;
  } else {
    map.setLayoutProperty('total-accidents', 'visibility', 'visible');
    map.setLayoutProperty('injury-fatality', 'visibility', 'none');
    data = totalData;
  }
  
  // Apply all filters to the selected dataset
  const filtered = filterFeatures(
    data.features,
    selectedYear,
    timeFilter,
    selectedWeather,
    selectedHitRun,
    selectedIllumination
  );
  
  // Update the map's data source with the filtered features
  const sourceName = selectedDataset;
  map.getSource(sourceName).setData({
    type: 'FeatureCollection',
    features: filtered,
  });

  // Update the stats and narrative text
  updateStepStats(filtered);
  updateStepNarrative();
}

map.on('load', async () => {
  // Fetch both datasets
  const response_injury = await fetch('https://dar0010.github.io/nashville-crash-data/accidents_injury_fatality.geojson');
  const response_total = await fetch('https://dar0010.github.io/nashville-crash-data/accidents_excluded.geojson');
  injuryFatalityData = await response_injury.json();
  totalData = await response_total.json();

  // Add both sources to the map
  map.addSource('total-accidents', { type: 'geojson', data: totalData });
  map.addSource('injury-fatality', { type: 'geojson', data: injuryFatalityData });

  // Define a shared paint configuration for the circle layers
  const circlePaintConfig = {
    'circle-color': '#d22f27',
    'circle-opacity': 0.35,
    'circle-radius': [
      'interpolate', ['linear'], ['get', 'Number of Motor Vehicles'],
      1, 4, 2, 6, 3, 8, 4, 10, 5, 12, 6, 14
    ]
  };

  // Add both layers, making only one visible initially
  map.addLayer({ id: 'total-accidents', type: 'circle', source: 'total-accidents', paint: circlePaintConfig });
  map.addLayer({ id: 'injury-fatality', type: 'circle', source: 'injury-fatality', layout: { visibility: 'none' }, paint: circlePaintConfig });

  // Populate the year dropdown dynamically
  const years = [...new Set(totalData.features.map(f => extractYear(f.properties['Date and Time'])).filter(y => y))].sort();
  yearDropDown.innerHTML = `<option value="all">All Years</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}`;

  // --- EVENT LISTENERS ---
  yearDropDown.addEventListener('change', () => {
    if (isScrolling) return; // Prevent this from firing when scrollama updates the dropdown

    selectedYear = yearDropDown.value;
    const storyYears = ['all', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    const targetStepIndex = storyYears.indexOf(selectedYear);
    
    // If the selected year corresponds to a story step, scroll to it
    if (targetStepIndex > -1) {
        const targetEl = document.querySelector(`.step[data-step="${targetStepIndex}"]`);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else {
        updateFilters(); // Otherwise, just update the filters
    }
  });

  // Listeners for all other filters
  weatherSelect.addEventListener('change', () => { selectedWeather = weatherSelect.value; updateFilters(); });
  hitrunSelect.addEventListener('change', () => { selectedHitRun = hitrunSelect.value; updateFilters(); });
  illumSelect.addEventListener('change', () => { selectedIllumination = illumSelect.value; updateFilters(); });
  dataDropDown.addEventListener('change', () => { selectedDataset = dataDropDown.value; updateFilters(); });
  timeSlider.addEventListener('input', updateFilters);

  // --- POPUP ON HOVER ---
  ['total-accidents', 'injury-fatality'].forEach(layerId => {
    let popup; // Define popup variable in a higher scope to manage it
    map.on('mouseenter', layerId, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const props = feature.properties;
      const coords = feature.geometry.coordinates.slice();
      
      // Ensure the popup is removed if one already exists
      if(popup) popup.remove();

      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
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
      if(popup) popup.remove();
    });
  });

  // --- SCROLLAMA SETUP ---
  const scroller = scrollama();
  scroller
    .setup({
      step: '.step',
      offset: 0.5,
      debug: false,
    })
    .onStepEnter(({ element, index }) => {
      // Manage active step highlighting
      document.querySelectorAll('.step').forEach(s => s.classList.remove('is-active'));
      element.classList.add('is-active');
      activeStepElement = element;

      // Update the year based on the scroll step
      const storyYears = ['all', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
      selectedYear = storyYears[index] || 'all';
      
      // --- FIX ---
      // The following lines were removed because they forced the dataset to change,
      // overriding the user's selection from the dropdown. By removing them, the
      // `selectedDataset` variable retains the user's choice.
      //
      // REMOVED: selectedDataset = (index === 0) ? 'total-accidents' : 'injury-fatality';
      // REMOVED: dataDropDown.value = selectedDataset;

      // Sync the year dropdown with the scroll state without triggering its change event
      isScrolling = true;
      yearDropDown.value = selectedYear;
      requestAnimationFrame(() => { isScrolling = false; }); // Reset flag after the next frame

      // Update the map and stats with the new year and the user's chosen dataset
      updateFilters();
    });

  window.addEventListener('resize', scroller.resize);
  
  // Set initial state for the first step on page load
  const initialStep = document.querySelector('.step[data-step="0"]');
  if(initialStep) {
    initialStep.classList.add('is-active');
    activeStepElement = initialStep;
  }
  
  // Perform an initial filter and render on load
  updateFilters();
});