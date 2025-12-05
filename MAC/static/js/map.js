// =============================================================
// GLOBALS
// =============================================================
let map;
let leafletMarkers = {};   // marker_id -> L.marker
let allMarkers = [];       // from markers.js
let markerClusterGroup;


// =============================================================
// INITIALISATION
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    if (!Array.isArray(MARKERS)) {
        console.error("MARKERS not loaded – check markers.js");
        return;
    }

    allMarkers = MARKERS;

    initMap();
    initFilters();
    populateFilterOptions();
    applyFilters();  // initial; also removes loading overlay
});


// =============================================================
// MAP INIT
// =============================================================
function initMap() {
    map = L.map("map").setView([51, 10], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18
    }).addTo(map);

    markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 14
    });
    map.addLayer(markerClusterGroup);

    createMarkers();
}


// =============================================================
// CREATE ALL MARKERS ONCE (BOUND TO GERMANY)
// =============================================================
function createMarkers() {
    allMarkers.forEach(m => {
        if (m.lat == null || m.lon == null) return;

        // Germany bounding box
        if (m.lat < 47.0 || m.lat > 55.5 || m.lon < 5.0 || m.lon > 15.5) {
            return;
        }

        const size = m.marker_size || 18;

        let color = "#777777";
        if (m.facility_group === "Pharmacies") {
            color = m.is_vca ? "#567872" : "#87cabe";
        } else if (m.facility_group === "Hospitals") {
            color = "#f68d2e";
        } else if (m.facility_group === "Rehabs") {
            color = "#ff5757";
        } else if (m.facility_group === "Physicians") {
            color = "#2a5b6c";
        }

        let label = "?";
        if (m.facility_group === "Pharmacies") {
            label = m.is_vca ? "★P" : "P";
        } else if (m.facility_group === "Hospitals") {
            label = "H";
        } else if (m.facility_group === "Rehabs") {
            label = "R";
        } else if (m.facility_group === "Physicians") {
            label = "D";
        }

        const icon = L.divIcon({
            html: `
                <div style="
                    background:${color};
                    width:${size}px;
                    height:${size}px;
                    border-radius:50%;
                    text-align:center;
                    line-height:${size}px;
                    color:white;
                    font-weight:600;
                    border:1px solid #33333355;
                ">
                    ${label}
                </div>
            `,
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        const popupText = m.tooltip_text || "";
        const popupHTML = `
            <div style="font-family:system-ui;font-size:14px;max-width:320px;line-height:1.4;">
                <pre style="white-space:pre-wrap;font-size:13px;">${popupText}</pre>
                <button type="button" style="
                    padding:6px 10px;
                    font-size:13px;
                    margin-top:8px;
                    cursor:pointer;
                    background:#2a5b6c;
                    border:none;
                    color:white;
                    border-radius:4px;
                " data-copy-text="${encodeURIComponent(popupText)}">
                    Copy
                </button>
            </div>
        `;

        const marker = L.marker([m.lat, m.lon], { icon });

        marker.__data = m;

        marker.bindPopup(popupHTML);

        leafletMarkers[m.marker_id] = marker;


        // Add copy handler when popup opens (avoids inline onclick escaping issues)
        marker.on("popupopen", (e) => {
            const el = e.popup.getElement();
            if (!el) return;

            const btn = el.querySelector("button[data-copy-text]");
            if (!btn) return;

            btn.addEventListener("click", async () => {
                const txt = decodeURIComponent(btn.getAttribute("data-copy-text") || "");
                try {
                    await navigator.clipboard.writeText(txt);
                    btn.textContent = "Copied";
                    setTimeout(() => { btn.textContent = "Copy"; }, 1000);
                } catch (err) {
                    console.warn("Clipboard copy failed:", err);
                }
            }, { once: true });
        });

        leafletMarkers[m.marker_id] = marker;
    });
}




// =============================================================
// FILTERS INIT (EVENTS + COLLAPSIBLE SECTIONS + DROPDOWNS)
// =============================================================
function initFilters() {
    // Collapsible sections
    document.querySelectorAll(".filter-header").forEach(header => {
        header.addEventListener("click", () => {
            const body = header.nextElementSibling;
            if (!body) return;
            body.classList.toggle("collapsed");
            const chev = header.querySelector(".chevron");
            if (chev) chev.textContent = body.classList.contains("collapsed") ? "▸" : "▾";
        });
    });

    // Facility group checkboxes
    document.querySelectorAll(".group-checkbox").forEach(cb => {
        cb.addEventListener("change", applyFilters);
    });

    // VCA radios
    document.querySelectorAll("input[name='vcaStatus']").forEach(r => {
        r.addEventListener("change", applyFilters);
    });

    // Proximity controls
    const proxEnabled = document.getElementById("prox-enabled");
    const proxRadius = document.getElementById("prox-radius");
    const proxLabel = document.getElementById("prox-radius-label");

    proxEnabled.addEventListener("change", applyFilters);
    proxRadius.addEventListener("input", () => {
        proxLabel.textContent = proxRadius.value;
    });
    proxRadius.addEventListener("change", applyFilters);

    // Reset / Export
    document.getElementById("reset-filters-btn")
        .addEventListener("click", resetFilters);
    document.getElementById("export-excel-btn")
        .addEventListener("click", exportToExcel);

    // Dropdown toggles
    document.querySelectorAll(".dropdown-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const parent = btn.closest(".dropdown-multi");
            if (!parent) return;
            parent.classList.toggle("open");
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener("click", evt => {
        if (!evt.target.closest(".dropdown-multi")) {
            document.querySelectorAll(".dropdown-multi.open")
                .forEach(el => el.classList.remove("open"));
        }
    });

    // Search inside dropdowns
    const searchMapping = [
        { searchId: "pharm-type-search", optionsId: "pharm-type-options" },
        { searchId: "reh-op-search", optionsId: "reh-op-options" },
        { searchId: "reh-fac-search", optionsId: "reh-fac-options" },
        { searchId: "hosp-op-search", optionsId: "hosp-op-options" },
        { searchId: "hosp-fac-search", optionsId: "hosp-fac-options" },
        { searchId: "hosp-spec-search", optionsId: "hosp-spec-options" },
        { searchId: "phys-spec-search", optionsId: "phys-spec-options" }
    ];

    searchMapping.forEach(({ searchId, optionsId }) => {
        const searchEl = document.getElementById(searchId);
        const container = document.getElementById(optionsId);
        if (!searchEl || !container) return;

        searchEl.addEventListener("input", () => {
            const q = searchEl.value.toLowerCase().trim();
            container.querySelectorAll("label").forEach(label => {
                const text = label.textContent.toLowerCase();
                label.style.display = text.includes(q) ? "" : "none";
            });
        });
    });

    // Dropdown checkbox changes trigger filtering
    [
        "pharm-type-options",
        "reh-op-options", "reh-fac-options",
        "hosp-op-options", "hosp-fac-options", "hosp-spec-options",
        "phys-spec-options"
    ].forEach(id => {
        const c = document.getElementById(id);
        if (!c) return;
        c.addEventListener("change", applyFilters);
    });
}


// =============================================================
// POPULATE DROPDOWN OPTIONS FROM DATA
// =============================================================
function populateFilterOptions() {
    const pharmTypes = new Set();
    const rehOpTypes = new Set();
    const rehFacTypes = new Set();
    const hospOpTypes = new Set();
    const hospFacTypes = new Set();
    const hospSpecs = new Set();
    const physSpecs = new Set();

    allMarkers.forEach(m => {
        if (m.facility_group === "Pharmacies" && m.vca_type) {
            pharmTypes.add(m.vca_type);
        }
        if (m.facility_group === "Rehabs") {
            if (m.operator_type) rehOpTypes.add(m.operator_type);
            if (m.facility_type) rehFacTypes.add(m.facility_type);
        }
        if (m.facility_group === "Hospitals") {
            if (m.operator_type) hospOpTypes.add(m.operator_type);
            if (m.facility_type) hospFacTypes.add(m.facility_type);
            if (Array.isArray(m.specialities)) {
                m.specialities.forEach(s => s && hospSpecs.add(s));
            }
        }
        if (m.facility_group === "Physicians") {
            if (Array.isArray(m.specialities)) {
                m.specialities.forEach(s => s && physSpecs.add(s));
            }
        }
    });

    fillDropdownOptions("pharm-type-options", pharmTypes);
    fillDropdownOptions("reh-op-options", rehOpTypes);
    fillDropdownOptions("reh-fac-options", rehFacTypes);
    fillDropdownOptions("hosp-op-options", hospOpTypes);
    fillDropdownOptions("hosp-fac-options", hospFacTypes);
    fillDropdownOptions("hosp-spec-options", hospSpecs);
    fillDropdownOptions("phys-spec-options", physSpecs);
}

function fillDropdownOptions(containerId, valuesSet) {
    const c = document.getElementById(containerId);
    if (!c) return;

    const sorted = Array.from(valuesSet).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    c.innerHTML = "";
    sorted.forEach(v => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = v;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + v));
        c.appendChild(label);
    });
}


// =============================================================
// RESET FILTERS
// =============================================================
function resetFilters() {
    document.querySelectorAll(".group-checkbox").forEach(cb => cb.checked = false);

    document.querySelectorAll("input[name='vcaStatus']").forEach(r => {
        r.checked = (r.value === "all");
    });

    [
        "pharm-type-options",
        "reh-op-options", "reh-fac-options",
        "hosp-op-options", "hosp-fac-options", "hosp-spec-options",
        "phys-spec-options"
    ].forEach(id => {
        const c = document.getElementById(id);
        if (!c) return;
        c.querySelectorAll("input[type='checkbox']").forEach(ch => {
            ch.checked = false;
        });
    });

    [
        "pharm-type-search",
        "reh-op-search", "reh-fac-search",
        "hosp-op-search", "hosp-fac-search", "hosp-spec-search",
        "phys-spec-search"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = "";
        const containerId = el.id.replace("-search", "-options");
        const c = document.getElementById(containerId);
        if (c) c.querySelectorAll("label").forEach(l => l.style.display = "");
    });

    const proxEnabled = document.getElementById("prox-enabled");
    const proxRadius = document.getElementById("prox-radius");
    const proxLabel = document.getElementById("prox-radius-label");

    proxEnabled.checked = false;
    proxRadius.value = 5;
    proxLabel.textContent = "5";

    applyFilters();
}


// =============================================================
// APPLY FILTERS
// =============================================================
function applyFilters() {

    const selectedGroups = Array.from(
        document.querySelectorAll(".group-checkbox:checked")
    ).map(cb => cb.value);

    if (selectedGroups.length === 0) {
        markerClusterGroup.clearLayers();
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.style.display = "none";
        return;
    }

    // --- VCA status radio buttons ---
    const vcaStatus = document.querySelector("input[name='vcaStatus']:checked")?.value || "all";

    // Normalisation helper
    const normalize = str => (str || "").trim().toLowerCase();

    // --- Dropdown filter selections ---
    const pharmTypes = getCheckedValues("pharm-type-options").map(normalize);
    const rehOp = getCheckedValues("reh-op-options");
    const rehFac = getCheckedValues("reh-fac-options");
    const hospOp = getCheckedValues("hosp-op-options");
    const hospFac = getCheckedValues("hosp-fac-options");
    const hospSpecs = getCheckedValues("hosp-spec-options");
    const physSpecs = getCheckedValues("phys-spec-options");

    // --- Proximity filter ---
    const proxEnabled = document.getElementById("prox-enabled").checked;
    const proxRadius = parseFloat(document.getElementById("prox-radius").value || "5");

    const baseVisible = new Set();

    // ============================================================
    // FIRST PASS — ATTRIBUTE FILTERS
    // ============================================================
    allMarkers.forEach(m => {
        const id = m.marker_id;
        const group = m.facility_group;

        if (!selectedGroups.includes(group)) return;
        if (!leafletMarkers[id]) return;

        // ----------------------------------------------------------
        // Pharmacies — VCA status + Type filtering
        // ----------------------------------------------------------
        if (group === "Pharmacies") {

            // 1. VCA-only
            if (vcaStatus === "vca" && !m.is_vca) {
                return;
            }

            // 2. Non-VCA-only
            if (vcaStatus === "nonvca" && m.is_vca) {
                return;
            }

            // 3. VCA Type filtering
            if (pharmTypes.length > 0) {
                const value = normalize(m.vca_type);
                const selected = pharmTypes.map(normalize);
                if (!selected.includes(value)) {
                    return;
                }
            }
        }


        // ----------------------------------------------------------
        // Rehabs
        // ----------------------------------------------------------
        if (group === "Rehabs") {
            if (rehOp.length > 0 && !rehOp.includes(m.operator_type)) return;
            if (rehFac.length > 0 && !rehFac.includes(m.facility_type)) return;
        }

        // ----------------------------------------------------------
        // Hospitals
        // ----------------------------------------------------------
        if (group === "Hospitals") {

            if (hospOp.length > 0 && !hospOp.includes(m.operator_type)) return;
            if (hospFac.length > 0 && !hospFac.includes(m.facility_type)) return;

            if (hospSpecs.length > 0) {
                const specs = Array.isArray(m.specialities) ? m.specialities : [];
                if (!specs.some(s => hospSpecs.includes(s))) return;
            }
        }

        // ----------------------------------------------------------
        // Physicians
        // ----------------------------------------------------------
        if (group === "Physicians") {

            if (physSpecs.length > 0) {
                const specs = Array.isArray(m.specialities) ? m.specialities : [];
                if (!specs.some(s => physSpecs.includes(s))) return;
            }
        }

        baseVisible.add(id);
    });

    // ============================================================
    // SECOND PASS — PROXIMITY FILTER
    // ============================================================
    const finalVisible = new Set(baseVisible);

    if (proxEnabled && proxRadius > 0) {

        // Only check proximity against visible non-pharmacies
        const targets = allMarkers.filter(m =>
            baseVisible.has(m.marker_id) &&
            m.facility_group !== "Pharmacies" &&
            m.lat != null &&
            m.lon != null
        );

        if (targets.length > 0) {
            const targetIds = new Set(targets.map(t => t.marker_id));

            allMarkers.forEach(pharm => {

                if (pharm.facility_group !== "Pharmacies") return;
                if (!leafletMarkers[pharm.marker_id]) return;
                if (pharm.lat == null || pharm.lon == null) return;

                let within = false;

                // Prefer cached distances when available
                if (Array.isArray(pharm.nearby) && pharm.nearby.length > 0) {

                    for (const [fid, dist] of pharm.nearby) {
                        if (targetIds.has(fid) && dist <= proxRadius) {
                            within = true;
                            break;
                        }
                    }

                } else {
                    // Fallback to live distance
                    const plat = pharm.lat;
                    const plon = pharm.lon;

                    for (const t of targets) {
                        const d = haversineKm(plat, plon, t.lat, t.lon);
                        if (d <= proxRadius) {
                            within = true;
                            break;
                        }
                    }
                }

                if (within) {
                    finalVisible.add(pharm.marker_id);
                }
            });
        }
    }

    // ============================================================
    // UPDATE MAP
    // ============================================================
    updateMap(finalVisible);

    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
}


// =============================================================
// UPDATE MAP (CLUSTERING)
// =============================================================
function updateMap(visibleSet) {
    markerClusterGroup.clearLayers();
    const visibleMarkers = [];

    allMarkers.forEach(m => {
        const marker = leafletMarkers[m.marker_id];
        if (!marker) return;
        if (visibleSet.has(m.marker_id)) visibleMarkers.push(marker);
    });

    markerClusterGroup.addLayers(visibleMarkers);

    if (visibleMarkers.length > 0) {
        try {
            const group = L.featureGroup(visibleMarkers);
            map.fitBounds(group.getBounds().pad(0.2));
        } catch {}
    }
}

// =============================================================
// EXPORT (Visible facilities -> Excel, one sheet per Facility Group)
// =============================================================
function exportToExcel() {
    const visibleIds = new Set();
    markerClusterGroup.eachLayer(layer => {
        if (layer && layer.__data && layer.__data.marker_id != null) {
            visibleIds.add(layer.__data.marker_id);
        }
    });

    if (visibleIds.size === 0) {
        alert("No facilities to export.");
        return;
    }

    const groupedRows = new Map();
    const groupedKeys = new Map();

    for (const m of allMarkers) {
        if (!visibleIds.has(m.marker_id)) continue;

        const groupName = (m.facility_group || "Unknown").toString().trim() || "Unknown";
        const exp = (m.export && typeof m.export === "object") ? m.export : {};

        const row = {
            "Facility Group": groupName,
            ...exp
        };

        if (!("lat" in row)) row.lat = (m.lat ?? "");
        if (!("lon" in row)) row.lon = (m.lon ?? "");

        if (Object.keys(exp).length === 0 && m.tooltip_text) {
            row["tooltip_text"] = m.tooltip_text;
        }

        // ---- NORMALISATION FIXES ----
        mergeSpecialitiesIntoSingleColumn(row);

        if (groupName === "Pharmacies") {
            renamePharmacyTypeColumn(row);
        }
        // ----------------------------

        if (!groupedRows.has(groupName)) groupedRows.set(groupName, []);
        groupedRows.get(groupName).push(row);

        if (!groupedKeys.has(groupName)) groupedKeys.set(groupName, new Set());
        Object.keys(row).forEach(k => groupedKeys.get(groupName).add(k));
    }

    const preferredOrder = [
        "Facility Group",
        "Name",
        "Full Address",
        "Postcode",
        "Operator",
        "Operator Type",
        "Facility Type",
        "VCA Type (if applicable)",
        "Email",
        "Number",
        "Phone",
        "Website",
        "Specialities",
        "Speciality(s) - Translated",
        "lat",
        "lon",
        "tooltip_text"
    ];

    const safeSheetName = (name) =>
        name.replace(/[:\\/?*\[\]]/g, " ").slice(0, 31).trim() || "Sheet";

    const wb = XLSX.utils.book_new();
    const groupNames = Array.from(groupedRows.keys()).sort((a, b) => a.localeCompare(b));

    groupNames.forEach(groupName => {
        const rows = groupedRows.get(groupName);
        const keys = Array.from(groupedKeys.get(groupName));

        const orderedColumns = [
            ...preferredOrder.filter(c => keys.includes(c)),
            ...keys.filter(c => !preferredOrder.includes(c))
        ];

        const ws = XLSX.utils.json_to_sheet(rows, { header: orderedColumns });
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(groupName));
    });

    XLSX.writeFile(wb, "Filtered_German_Facility_Info.xlsx");
}






// =============================================================
// HELPERS
// =============================================================
function getCheckedValues(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return [];
    return Array.from(c.querySelectorAll("input[type='checkbox']:checked"))
        .map(cb => cb.value);
}

// Simple Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function mergeSpecialitiesIntoSingleColumn(row) {
    // Matches Specialty_EN_Canon_1 ... Specialty_EN_Canon_29 (and any number)
    const specKeys = Object.keys(row)
        .filter(k => /^Specialty_EN_Canon_\d+$/.test(k))
        .sort((a, b) => {
            const na = parseInt(a.split("_").pop(), 10);
            const nb = parseInt(b.split("_").pop(), 10);
            return na - nb;
        });

    if (specKeys.length === 0) return;

    const values = specKeys
        .map(k => row[k])
        .map(v => (v == null ? "" : String(v).trim()))
        .filter(v => v && v.toLowerCase() !== "nan");

    // Remove the original columns regardless (prevents 29 empty headings)
    specKeys.forEach(k => delete row[k]);

    if (values.length > 0) {
        row["Specialities"] = values.join(", ");
    }
}

function renamePharmacyTypeColumn(row) {
    // Only rename if it exists and hasn't already been renamed
    if ("Type" in row && !("VCA Type (if applicable)" in row)) {
        row["VCA Type (if applicable)"] = row["Type"];
        delete row["Type"];
    }
}
