'use strict';

/**
 * This module is responsible for painting the gesture trail.
 * No attempt is made to draw a trail if the document body is not loaded.
 */
var modules = modules || {};
modules.interface = (function (settings) {

  // State for this module.
  var state = {
    body: null,           // Element in which to append the canvas.
    canvas: null,         // The canvas element on which to draw.
    ctx: null,            // 2D drawing context from the canvas.
    x: 0,                 // The last mouse position.
    y: 0,
    status: {
      outerElement: null, // Status text outer element.
      innerElement: null, // Status text inner element.
      handle: null        // Status timeout handle.
    },
    popup: {
                          // TODO Not implemented yet.
    }
  };

  var deltaAccumulator = new MouseDeltaAccumulator();

  // ---------------------------------------------------------------------------

  // Locate the element to treat as the body.
  function findBody () {
    if (!state.body) {
      if (document.body) {
        // Use the HTML node for framesets. Placing the canvas under the HTML
        // node is of questionable validity but it works.
        state.body = (document.body.tagName === 'FRAMESET') ?
          document.body.parentNode : document.body;
      } else {
        // Document body is not loaded yet.
        return false;
      }
    }
    return true;
  }

  // Store the initial position of the mouse.
  function beginTrail (mouseDown) {
    // Set the initial mouse position.
    state.x = mouseDown.x;
    state.y = mouseDown.y;
  }

  // Start or continue painting the gesture trail.
  function updateTrail (mouseMove) {
    // Require a minimum distance travelled before painting will occur.
    deltaAccumulator.accumulate(mouseMove);
    if (modules.helpers.distanceDelta(mouseMove) >= settings.trailFidelity) {
      deltaAccumulator.reset();

      if (!findBody()) {
        return;
      }

      // Create the canvas on the first mouse move event.
      if (!state.canvas) {
        state.canvas = document.createElement('canvas');

        // Use fixed positioning and match the window size.
        state.canvas.setAttribute('width', window.innerWidth);
        state.canvas.setAttribute('height', window.innerHeight);
        state.canvas.style.position = 'fixed';
        state.canvas.style.top = 0;
        state.canvas.style.left = 0;
        state.canvas.style.zIndex = 99999;
        state.canvas.style.pointerEvents = 'none';
        state.body.appendChild(state.canvas);

        // Initialize the drawing context.
        state.ctx = state.canvas.getContext('2d');
        state.ctx.lineWidth = settings.trailWidth;
        state.ctx.strokeStyle = settings.trailColor;
        state.ctx.lineCap = "round";
      }

      // Draw a segment of the mouse gesture line.
      state.ctx.beginPath();
      state.ctx.moveTo(state.x, state.y);
      state.x += mouseMove.dx;
      state.y += mouseMove.dy;
      state.ctx.lineTo(state.x, state.y);
      state.ctx.stroke();
    }
  }

  // Remove the canvas element used to paint the gesture.
  function finishTrail () {
    if (!!state.canvas) {
      deltaAccumulator.reset();
      state.body.removeChild(state.canvas);
      state.canvas = null;
      state.ctx = null;
    }
  }

  // Status --------------------------------------------------------------------

  function insertStatusMarkup () {
    var template = document.createElement('template');
    template.innerHTML = settings.statusTemplate;

    // Get references to the container and span elements.
    state.status.outerElement = template.content.firstChild;
    state.status.innerElement = state.status.outerElement.querySelector('[data-mg-status]');
    state.body.appendChild(state.status.outerElement);
  }

  //
  function status (content) {
    if (!findBody()) {
      return;
    }

    if (content) {
      // Create the status element if not present.
      if (!state.status.outerElement) {
        insertStatusMarkup();
      }

      // Update the status.
      state.status.innerElement.innerHTML = content;

      // Reset the status timeout.
      resetStatusTimeout();
    } else {
      // Clear the status.
      onStatusTimeout();
    }
  }

  // Clear the status timeout and start a new one.
  function resetStatusTimeout () {
    window.clearTimeout(state.status.handle);
    state.status.handle = window.setTimeout(onStatusTimeout,
      settings.statusTimeout);
  }

  // Remove the status element.
  function onStatusTimeout () {
    if (state.status.outerElement) {
      state.body.removeChild(state.status.outerElement);
    }

    state.status.outerElement = null;
    state.status.innerElement = null;
    state.status.handle = null;
  }

  return {
    beginTrail: beginTrail,
    updateTrail: updateTrail,
    finishTrail: finishTrail,
    status: status
  };

}(modules.settings));
