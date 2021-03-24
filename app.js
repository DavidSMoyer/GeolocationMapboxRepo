const KEY = "pk.eyJ1IjoiZG1veWVyIiwiYSI6ImNrbW1jcGkyMjFqcG4ycG80dWl3NThhNGkifQ.FZSZFhFoJG9tOJTMs2Bt2g";
const API_BASE = "https://api.mapbox.com";
const STYLE = "mapbox://styles/mapbox/satellite-v9";
let userLocation;
const form = document.querySelector("form");
const search = form.querySelector("input");
const searchList = document.querySelector("ul.points-of-interest");
searchList.innerHTML = "";
let userPos;
const poiMarkers = [];
const mapContain = document.querySelector("#map-contain");
let currentPOI;

mapboxgl.accessToken = KEY;
const map = new mapboxgl.Map({
  container: 'map',
  style: STYLE,
  center: [0, 0]
});

navigator.geolocation.getCurrentPosition(pos => {
  console.log(pos);
  userPos = [pos.coords.longitude, pos.coords.latitude];
  userLocation = createMarker(userPos, "My Location");
  goTo(userPos);
  const locationSC = mapContain.querySelector(".your-location");
  locationSC.dataset.lng = userPos[0];
  locationSC.dataset.lat = userPos[1];
}, error => {
  console.warn(error);
}, {enableHighAccuracy: true, timeout: 3000, maximumAge: 0});

function createMarker(pos, msg, color = "#ee7dff", visible = true) {
  const marker = new mapboxgl.Marker({
    color: color,
  }).setLngLat(pos).
    addTo(map).
    setPopup(new mapboxgl.Popup({closeButton: false}).setHTML(`${msg}`));
  if (visible) marker.togglePopup();
  return marker;
}

function goTo(pos, duration = 1500, zoom = undefined) {
  if (duration <= 0) {
    map.jumpTo({center: pos});
  } else {
    map.easeTo({center: pos, duration: duration});
    if (zoom !== undefined) map.easeTo({zoom: zoom});
  }
}

function addPOI(name, address, distance, pos) {
  searchList.insertAdjacentHTML('beforeend',
  `
    <li class="poi" data-lng=${pos[0]} data-lat=${pos[1]}>
      <ul>
        <li class="name">${name}</li>
        <li class="address">${address}</li>
        <li class="distance">${distance} KM</li>
      </ul>
    </li>
  `);
}

function distanceBetween(pos1, pos2) {
  const r = 6731;
  const dlng = degToRad(pos1[0] - pos2[0]);
  const dlat = degToRad(pos1[1] - pos2[1]);
  const a = 
    Math.sin(dlat/2) * Math.sin(dlat/2) +
    Math.cos(degToRad(pos1[1])) * Math.cos(degToRad(pos2[1])) * 
    Math.sin(dlng/2) * Math.sin(dlng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return r * c;
}

function degToRad(deg) {
  return deg * (Math.PI / 180);
}

form.addEventListener("submit", e => {
  e.preventDefault();
  markPoints(search.value);
  search.value = "";
})

searchList.addEventListener("click", (e) => {
  if (e.target.closest(".poi") === undefined) return;
  const li = e.target.closest(".poi");
  let pos = [parseFloat(li.dataset.lng), parseFloat(li.dataset.lat)];
  goTo(pos)
  currentPOI = pos;
  removeRoute();
  for (const marker of poiMarkers) if (marker.getPopup().isOpen()) marker.togglePopup();
  const marker = poiMarkers.find(marker => pos[0] === marker._lngLat.lng && pos[1] === marker._lngLat.lat);
  marker.togglePopup();
});

mapContain.addEventListener("click", e => {
  if (e.target.closest(".your-location") !== null) {
    const myLocation = e.target.closest(".your-location");
    const long = parseFloat(myLocation.dataset.lng);
    const lat = parseFloat(myLocation.dataset.lat);
    goTo([long, lat]);
  } else if (e.target.closest(".gas-station") !== null) {
    markPoints("gas station");
  } else if (e.target.closest(".restaurant") !== null) {
    markPoints("restaurant");
  } else if (e.target.closest(".route") !== null) {
    const method = e.target.closest(".route").dataset.type;
    getRoute(currentPOI, method);
  }
});

function markPoints(query) {
  fetch(API_BASE + `/geocoding/v5/mapbox.places/${query}.json?access_token=${KEY}&limit=10&proximity=${userPos[0]},${userPos[1]}`).
    then(response => response.json()).
    then(data => {
      poiMarkers.forEach(marker => marker.remove());
      poiMarkers.length = 0;
      searchList.innerHTML = "";
      const sortedLocations = data.features.sort((poi1, poi2) => {
        return distanceBetween(poi1.center, userPos) - distanceBetween(poi2.center, userPos);
      });
      for (const poi of sortedLocations) {
        const name = poi.place_name.split(", ");
        addPOI(name[0], name[1], distanceBetween(userPos, poi.center).toFixed(1), poi.center);
        poiMarkers.push(createMarker(poi.center, name[0] + ", " + name[1], "#c9555c", false));
      }
    });
}

function getRoute(endPos, type = "walking") {
  console.log(endPos, type);
  fetch(API_BASE + `/directions/v5/mapbox/${type}/${userPos[0]},${userPos[1]};${endPos[0]},${endPos[1]}
    ?geometries=geojson&access_token=${KEY}`).
    then(response => response.json()).
    then(data => {
      const route = data.routes[0];
      console.log(route);
      const path = route.geometry.coordinates;
      const geoJson = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: path
        }
      }

      const ADD_DIST = 0.0001;
      const west = userPos[0] < endPos[0] ? userPos[0] - (userPos[0] * ADD_DIST) : endPos[0] - (endPos[0] * ADD_DIST);
      const east = userPos[0] < endPos[0] ? endPos[0] + (endPos[0] * ADD_DIST) : userPos[0] + (userPos[0] * ADD_DIST);
      const south = userPos[1] < endPos[1] ? userPos[1] - (userPos[0] * ADD_DIST) : endPos[1] - (endPos[0] * ADD_DIST);
      const north = userPos[1] < endPos[1] ? endPos[1] + (endPos[0] * ADD_DIST) : userPos[1] + (userPos[0] * ADD_DIST);
      map.setMaxBounds([[west, south], [east, north]]);

      if (map.getSource('route')) {
        map.getSource('route').setData(geoJson);
      } else {
        map.addLayer({
          id: "route",
          type: 'line',
          source: {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: path
              }
            }
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3887be',
            'line-width': 5,
            'line-opacity': 1
          }
        });
      }
    }).
    catch(error => console.log(error));
}

function removeRoute() {
  if (map.getLayer('route')) map.removeLayer('route');
  if (map.getSource('route')) map.removeSource('route');
  map.setMaxBounds(null);
}