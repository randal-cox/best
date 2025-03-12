document.addEventListener("DOMContentLoaded", function () {
    switchTab("nfromp"); // Open "p from n" by default
    updateAll(); // Ensure all charts load immediately
});

/* === Updates Both Charts === */
function updateAll() {
    updateNFromP(); // Updates "n from p"
    updatePFromN(); // Updates "p from n"
}

/* === Updates "n from p" Chart & Table === */
function updateNFromP() {
    let C = parseFloat(document.getElementById("C").value) / 100;
    let O = parseInt(document.getElementById("O").value);
    let N = parseInt(document.getElementById("N").value);
    let dP = parseFloat(document.getElementById("dP").value) / 100;
    let maxP = parseFloat(document.getElementById("maxP").value) / 100;

    let results = [];
    for (let p = dP; p <= maxP; p += dP) {
        let n = findMinN(p, O, C);
        results.push([p, n]);
    }

    renderNFromPChart(results, C, O);
    renderNFromPTable(results);
}

/* === Updates "p from n" Chart & Table === */
function updatePFromN() {
    let C = parseFloat(document.getElementById("C").value) / 100;
    let O = parseInt(document.getElementById("O").value);
    let N = parseInt(document.getElementById("N").value);

    let results = [];
    for (let n = 1; n <= N; n++) {
        let maxP = findMaxP(n, O, C);
        results.push([n, maxP]);
    }

    renderPFromNChart(results, C, O);
    renderPFromNTable(results);
}

/* === Compute Minimum n Needed for Given p (n from p) === */
function findMinN(p, O, C) {
    let n = 1;

    while (true) {  // Keep going until we find a valid n
        let cumulativeProbability = 0;
        for (let k = 0; k < O; k++) {
            cumulativeProbability += binomial(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
        }
        let atLeastOProbability = 1 - cumulativeProbability;

        if (atLeastOProbability >= C) {
            return n; // Stop when the probability condition is met
        }

        n++; // Keep increasing n until we meet the threshold
    }
}

/* === Compute Maximum p Given n (p from n) === */
function findMaxP(n, O, C) {
    let p = 0;
    let step = 1e-6; // Smaller step size for higher precision

    while (p <= 1) {
        let cumulativeProbability = 0;

        for (let k = 0; k < O; k++) {
            cumulativeProbability += binomial(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
        }
        let atLeastOProbability = 1 - cumulativeProbability;

        if (atLeastOProbability >= C) {
            return p; // Correct probability found
        }

        p += step; // Increment p with fine precision
    }

    return 1; // If no valid p is found, return 100%
}

/* === Binomial Coefficient Function === */
function binomial(n, k) {
    if (k > n) return 0;
    let coeff = 1;
    for (let i = 0; i < k; i++) {
        coeff *= (n - i) / (i + 1);
    }
    return coeff;
}

/* === Render "n from p" Chart === */
function renderNFromPChart(results, C, O) {
    let chartDiv = document.getElementById("chartContainerNfromP");
    chartDiv.innerHTML = `
        <h3>Trials Needed to Sample Tag ${O} Times</h3>
        <p>At ${(C * 100).toFixed(1)}% Confidence</p>
        <div id="dygraph-nfromp" style="position: relative;"></div>
    `;

    new Dygraph(document.getElementById("dygraph-nfromp"), results, {
        labels: ["p", "n"],
        logscale: true,
        xlabel: "Probability (p)",
        ylabel: "Trials Needed (n)",
        axes: {
            x: { logscale: true },
            y: { logscale: true }
        }
    });
}

/* === Render "p from n" Chart === */
function renderPFromNChart(results, C, O) {
    let chartDiv = document.getElementById("chartContainerPfromN");
    chartDiv.innerHTML = `
        <h3>Min Probability for ${O} Observations in n Trials</h3>
        <p>At ${(C * 100).toFixed(1)}% Confidence</p>
        <div id="dygraph-pfromn" style="position: relative;"></div>
    `;

    new Dygraph(document.getElementById("dygraph-pfromn"), results, {
        labels: ["n", "p"],
        logscale: false,
        xlabel: "Trials (n)",
        ylabel: "Probability (p)",
        valueRange: [0, 1], // Forces y-axis to always be between 0 and 1
        axes: {
            x: { logscale: true },
            y: { logscale: false }
        }
    });
}

/* === Render "n from p" Table === */
function renderNFromPTable(results) {
    let tableHTML = `
        <details>
            <summary style="cursor: pointer; font-weight: bold; margin-top: 20px;">Show Table</summary>
            <table style="margin-top: 10px;">
                <tr><th>p</th><th>n</th></tr>`;

    results.forEach(row => {
        tableHTML += `<tr><td>${(row[0] * 100).toFixed(1)}%</td><td>${row[1]}</td></tr>`;
    });

    tableHTML += `</table></details>`;

    document.getElementById("tableContainerNfromP").innerHTML = tableHTML;
}

/* === Render "p from n" Table === */
function renderPFromNTable(results) {
    let tableHTML = `
        <details>
            <summary style="cursor: pointer; font-weight: bold; margin-top: 20px;">Show Table</summary>
            <table style="margin-top: 10px;">
                <tr><th>n</th><th>p</th></tr>`;

    results.forEach(row => {
        tableHTML += `<tr><td>${row[0]}</td><td>${(row[1] * 100).toFixed(3)}%</td></tr>`;
    });

    tableHTML += `</table></details>`;

    document.getElementById("tableContainerPfromN").innerHTML = tableHTML;
}

function updateMissingMass() {
    let tagData = document.getElementById("tagInput").value.trim().split("\n");
    let seenTags = new Map();
    let results = [];
    let totalTags = 0;

    if (tagData.length === 0 || (tagData.length === 1 && tagData[0] === "")) {
        document.getElementById("missingMassTable").innerHTML = "<p>No data entered.</p>";
        document.getElementById("chartContainerMissingMass").innerHTML = "";
        return;
    }

    for (let n = 1; n <= tagData.length; n++) {
        let tags = tagData[n - 1].split(",").map(t => t.trim()).filter(Boolean);
        tags.forEach(tag => {
            seenTags.set(tag, (seenTags.get(tag) || 0) + 1);
            totalTags++;
        });

        let f1 = Array.from(seenTags.values()).filter(count => count === 1).length;
        let E = (n * f1) / (totalTags ** 2);
        let poissonC = 1.96; // Approximate 95% confidence interval
        let Upper = E + poissonC * n * Math.sqrt(f1) / (totalTags ** 2);

        results.push([n, totalTags, f1, E, Upper]); // Ensure Total Tags and Singlets are stored
    }

    renderMissingMassTable(results);
    renderMissingMassChart(results);
}



function renderMissingMassTable(results) {
    if (results.length === 0) {
        document.getElementById("missingMassTable").innerHTML = "<p>No data available.</p>";
        return;
    }

    let tableHTML = `
        <details>
            <summary style="cursor: pointer; font-weight: bold; margin-top: 20px;">Show Table</summary>
            <table style="margin-top: 10px;">
                <tr>
                    <th>n</th>
                    <th>Total Tags (T)</th>
                    <th>Singlets (f1)</th>
                    <th>Expected Missing Mass (E)</th>
                    <th>Maximum Missing Mass</th>
                </tr>`;

    results.forEach(row => {
        tableHTML += `
            <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>  <!-- Total Tags -->
                <td>${row[2]}</td>  <!-- Singlets -->
                <td>${row[3].toFixed(4)}</td>
                <td>${row[4].toFixed(4)}</td>  <!-- Upper Bound -->
            </tr>`;
    });

    tableHTML += `</table></details>`;

    document.getElementById("missingMassTable").innerHTML = tableHTML;
}
function renderMissingMassChart(results) {
    let chartDiv = document.getElementById("chartContainerMissingMass");
    chartDiv.innerHTML = `
        <h3>Missing Mass Estimates</h3>
        <div id="dygraph-missingmass" style="position: relative; width: 100%; height: 300px;"></div>
    `;

    if (results.length === 0) {
        document.getElementById("chartContainerMissingMass").innerHTML = "<p>No data to display.</p>";
        return;
    }

    // Get Maximum Missing Mass from the first row (n=1)
    let firstRowUpper = results.length > 0 ? results[0][4] : 1;

    // Convert data into array format with explicit numbers
    let chartData = results.map(row => [parseFloat(row[0]), parseFloat(row[3]), parseFloat(row[4])]);

    console.log("Final Chart Data Sent to Dygraphs:", chartData); // Debugging Output

    new Dygraph(document.getElementById("dygraph-missingmass"), chartData, {
        labels: ["Trials (n)", "Expected", "Maximum"],
        xlabel: "Trials (n)",
        ylabel: "Missing Mass",
        valueRange: [0, firstRowUpper], // Use n=1's max missing mass
        colors: ["#2E7D32", "#A5D6A7"],  // Dark Red for Expected, Light Red for Maximum
        strokeWidth: 2, // Keep lines clearly visible
        labelsSeparateLines: true,
        axes: {
            x: { logscale: false },
            y: {
                logscale: false,
                valueFormatter: v => v.toFixed(3) // Rounds to 3 decimal places
            }
        },
        legend: "always"
    });
}










function fillDemoTags() {
    let maxN = parseInt(document.getElementById("N").value); // Number of samples
    let tags = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").slice(0, 20); // Use A-T
    let alpha = 1.2; // Adjusted drop-off rate (shallower than before)

    // Compute probabilities using power-law
    let probabilities = tags.map((_, i) => 1 / Math.pow(i + 1, alpha));

    // Normalize so probabilities sum to 1
    let sumProb = probabilities.reduce((sum, p) => sum + p, 0);
    probabilities = probabilities.map(p => p / sumProb);

    let demoData = [];
    for (let i = 0; i < maxN; i++) {
        let numTags = Math.max(1, Math.floor(Math.random() * 6) + 5); // Sample 5-10 tags

        // Sample tags based on probability
        let sampledTags = [];
        while (sampledTags.length < numTags) {
            let tagIndex = Math.floor(Math.random() * tags.length);
            if (!sampledTags.includes(tags[tagIndex]) && Math.random() < probabilities[tagIndex]) {
                sampledTags.push(tags[tagIndex]);
            }
        }

        demoData.push(sampledTags.join(",")); // Store as comma-separated string
    }

    document.getElementById("tagInput").value = demoData.join("\n");
    updateMissingMass(); // Ensure UI updates immediately
}




/* === Tab Switching Function === */
function switchTab(tabId) {
    document.querySelectorAll(".content").forEach(content => {
        content.classList.remove("active");
    });
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });
    document.getElementById(tabId).classList.add("active");
    document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`).classList.add("active");

    updateAll();
}
