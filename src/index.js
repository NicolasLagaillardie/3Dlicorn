/* eslint-disable import/prefer-default-export */
/* eslint-disable import/no-extraneous-dependencies */

import macro from 'vtk.js/Sources/macro';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';
import vtkURLExtract from 'vtk.js/Sources/Common/Core/URLExtract';
import vtkXMLPolyDataReader from 'vtk.js/Sources/IO/XML/XMLPolyDataReader';

import {
    ColorMode,
    ScalarMode,
} from 'vtk.js/Sources/Rendering/Core/Mapper/Constants';

import style from './GeometryViewer.mcss';

import show from '../media/show.png';
import hide from '../media/hide.png';

import GPU, {
    input
} from 'gpu.js';


// ----------------------------------------------------------------------------
// Start code
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// GPU tests
// ----------------------------------------------------------------------------

const gpu = new GPU();

const fullArray = gpu.createKernel(function () {
    return this.thread.x;
}).setOutput([64]);


const testArray = fullArray();
let confirmArray = Array(testArray.length).fill(0);
const keptPoints = [2, 3];

const myFunc = gpu.createKernel(function (array, testPoint) {
    if (array[this.thread.x] === testPoint) {
        return 1;
    }
}).setOutput([testArray.length]).setLoopMaxIterations(1);

const confirm = gpu.createKernel(function (array, keptPoints, maxi) {
    if (array[this.thread.x] === keptPoints[this.thread.y]) {
        return array[this.thread.x];
    } else {
        return maxi;
    }
}).setOutput([testArray.length]).setLoopMaxIterations(1);

confirmArray = myFunc(testArray, 0);
console.log(confirmArray);

let result = confirmArray;
let maxi = [result];

while (result.length > 1) {

    const kernel = gpu.createKernel(function (a, b) {
            return a[this.thread.x] + b[this.thread.x] - 1;
        })
        .setOutput([parseInt(result.length / 2) + result.length % 2]);

    const first = result.slice(0, result.length / 2);
    const second = result.slice(result.length / 2);
    maxi.push(kernel(first, second));
    result = maxi[maxi.length-1];
}

console.log(result);
console.log(maxi);

// ----------------------------------------------------------------------------
// VTK init
// ----------------------------------------------------------------------------

let autoInit = true;
let background = [0, 0, 0];
let renderWindow;
let renderer;

let maxSerie = 13;
let serie = Math.floor(Math.random() * maxSerie) + 1;

// Process arguments from URL
const userParams = vtkURLExtract.extractURLParameters();

// Background handling
if (userParams.background) {
    background = userParams.background.split(',').map((s) => Number(s));
}
const selectorClass =
    background.length === 3 && background.reduce((a, b) => a + b, 0) < 1.5 ?
    style.dark :
    style.light;

// lut
const lutName = userParams.lut || 'erdc_rainbow_bright';

// field
const field = userParams.field || '';

// camera
function updateCamera(camera) {
  ['zoom', 'pitch', 'elevation', 'yaw', 'azimuth', 'roll', 'dolly'].forEach(
        (key) => {
            if (userParams[key]) {
                camera[key](userParams[key]);
            }
            renderWindow.render();
        }
    );
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// ----------------------------------------------------------------------------
// Save the current unicorn on a cookie
// ----------------------------------------------------------------------------

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

const currentUnicornCookie = getCookie("UnicornNumber");

if (currentUnicornCookie === "") {
    document.cookie = "UnicornNumber=" + serie;
} else {
    serie = Number(currentUnicornCookie);
}

// ----------------------------------------------------------------------------
// DOM containers for UI control
// ----------------------------------------------------------------------------

const rootControllerContainer = document.createElement('div');
rootControllerContainer.setAttribute('class', style.rootController);

const addDataSetButton = document.createElement('img');
addDataSetButton.setAttribute('class', style.button);
addDataSetButton.setAttribute('src', hide);
addDataSetButton.addEventListener('click', () => {
    const isVisible = rootControllerContainer.style.display !== 'none';
    rootControllerContainer.style.display = isVisible ? 'none' : 'flex';
    addDataSetButton.style.display = isVisible ? show : hide;
});

// ----------------------------------------------------------------------------
// Add class to body if iOS device
// ----------------------------------------------------------------------------

const iOS = /iPad|iPhone|iPod/.test(window.navigator.platform);

if (iOS) {
    document.querySelector('body').classList.add('is-ios-device');
}

// ----------------------------------------------------------------------------

function emptyContainer(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

// ----------------------------------------------------------------------------

function createViewer(container) {
    const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer: container,
        containerStyle: {
            height: '100%',
            width: '100%',
            position: 'absolute'
        },
    });
    renderer = fullScreenRenderer.getRenderer();
    renderWindow = fullScreenRenderer.getRenderWindow();
    renderWindow.getInteractor().setDesiredUpdateRate(15);

    container.appendChild(rootControllerContainer);
    container.appendChild(addDataSetButton);

}

// ----------------------------------------------------------------------------

function createPipeline(fileName, fileContents) {
    // Create UI

    const serieSelector = document.createElement('select');
    serieSelector.setAttribute('class', selectorClass);
    serieSelector.id = "serieSelector";

    const controlContainer = document.createElement('div');
    controlContainer.setAttribute('class', style.control);
    controlContainer.appendChild(serieSelector);
    rootControllerContainer.appendChild(controlContainer);

    // VTK pipeline
    const vtpReader = vtkXMLPolyDataReader.newInstance();
    vtpReader.parseAsArrayBuffer(fileContents);

    const lookupTable = vtkColorTransferFunction.newInstance();
    const source = vtpReader.getOutputData(0);
    const mapper = vtkMapper.newInstance({
        interpolateScalarsBeforeMapping: false,
        useLookupTableScalarRange: true,
        lookupTable,
        scalarVisibility: false,
    });
    const actor = vtkActor.newInstance();
    const scalars = source.getPointData().getScalars();
    const dataRange = [].concat(scalars ? scalars.getRange() : [0, 1]);

    // --------------------------------------------------------------------
    // DOM elements
    // --------------------------------------------------------------------

    for (let i = 1; i <= maxSerie; i++) {
        serieSelector.options[serieSelector.options.length] = new Option("Unicorn " + i, i);
    }

    serieSelector.value = serie;

    function updateSerie(event) {
        // We empty the root containers and nullify the fullScreenRenderer then reload with the new serie

        serie = Number(event.target.value);
        renderWindow = null;
        renderer = null;

        emptyContainer(rootControllerContainer);

        document.cookie = "UnicornNumber=" + serie;

        initLocalFileLoader();
    }
    serieSelector.addEventListener('change', updateSerie);

    // --------------------------------------------------------------------
    // Pipeline handling
    // --------------------------------------------------------------------

    actor.setMapper(mapper);
    mapper.setInputData(source);
    renderer.addActor(actor);

    // Manage update when lookupTable change
    lookupTable.onModified(() => {
        renderWindow.render();
    });

    // First render
    renderer.resetCamera();
    renderWindow.render();

}

// ----------------------------------------------------------------------------

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = function onLoad(e) {
        createPipeline(file.name, reader.result);
    };
    reader.readAsArrayBuffer(file);
}

// ----------------------------------------------------------------------------

function UrlExists(url) {
    //Check if a file exist
    let http = new XMLHttpRequest();
    http.open('HEAD', url, false);
    http.send();
    return http.status != 404;
}

// ----------------------------------------------------------------------------

function load(container, options) {
    autoInit = false;
    emptyContainer(container);

    if (options.files) {
        createViewer(container);
        let count = options.files.length;
        while (count--) {
            loadFile(options.files[count]);
        }
        updateCamera(renderer.getActiveCamera());
    } else if (options.fileURL) {
        const urls = [].concat(options.fileURL);
        const progressContainer = document.createElement('div');
        progressContainer.setAttribute('class', style.progress);
        container.appendChild(progressContainer);

        const progressCallback = (progressEvent) => {
            if (progressEvent.lengthComputable) {
                const percent = Math.floor(
                    100 * progressEvent.loaded / progressEvent.total
                );
                progressContainer.innerHTML = `Loading ${percent}%`;
            } else {
                progressContainer.innerHTML = macro.formatBytesToProperUnit(
                    progressEvent.loaded
                );
            }
        };

        createViewer(container);
        const nbURLs = urls.length;
        let nbLoadedData = 0;

        /* eslint-disable no-loop-func */
        while (urls.length) {
            const url = urls.pop();
            const name = Array.isArray(userParams.name) ?
                userParams.name[urls.length] :
                `Data ${urls.length + 1}`;
            HttpDataAccessHelper.fetchBinary(url, {
                progressCallback,
            }).then((binary) => {
                nbLoadedData++;
                if (nbLoadedData === nbURLs) {
                    container.removeChild(progressContainer);
                }
                createPipeline(name, binary);
                updateCamera(renderer.getActiveCamera());
            });
        }
    }
}

function initLocalFileLoader(container) {
    const exampleContainer = document.querySelector('.content');
    const rootBody = document.querySelector('body');
    const myContainer = container || exampleContainer || rootBody;

    if (myContainer !== container) {
        myContainer.classList.add(style.fullScreen);
        rootBody.style.margin = '0';
        rootBody.style.padding = '0';
    } else {
        rootBody.style.margin = '0';
        rootBody.style.padding = '0';
    }

    // Check if every needed file is present, else rise an error
    let errors = []
    userParams.name = [];
    let fileURL = [];

    // Add the file path to load to a list if it exists, else store errors

    if (UrlExists("/vtp/unicorn_" + serie + ".vtp")) { // For dev (npm start)
        fileURL.push("/vtp/unicorn_" + serie + ".vtp");
        userParams.name.push("Unicorn " + serie);
    } else if (UrlExists("./vtp/unicorn_" + serie + ".vtp")) { // For server-user
        fileURL.push("./vtp/unicorn_" + serie + ".vtp");
        userParams.name.push("Unicorn " + serie);
    } else {
        errors.push("Missing unicorn " + serie);
    }

    load(myContainer, {
        fileURL
    });
}

// Look at URL an see if we should load a file
// ?fileURL=https://data.kitware.com/api/v1/item/59cdbb588d777f31ac63de08/download
if (userParams.url || userParams.fileURL) {
    const exampleContainer = document.querySelector('.content');
    const rootBody = document.querySelector('body');
    const myContainer = exampleContainer || rootBody;

    if (myContainer) {
        myContainer.classList.add(style.fullScreen);
        rootBody.style.margin = '0';
        rootBody.style.padding = '0';
    }

    load(myContainer, userParams);
}

// Auto setup if no method get called within 100ms
setTimeout(() => {
    if (autoInit) {
        initLocalFileLoader();
    }
}, 100);
