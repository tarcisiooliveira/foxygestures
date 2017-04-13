/* global angular */
'use strict';

var app = angular.module('mgOptionsApp', [
  'ui.bootstrap'
]);

// -----------------------------------------------------------------------------
app.factory('moduleLoader', [
  '$q',
  '$interval',
  function ($q, $interval) {
    // Get a function that returns a promise that is resolved when
    // modules[module] is defined.
    return function (module) {
      if (modules[module]) {
        return $q.resolve(modules[module]);
      } else {
        var deferred = $q.defer();
        var promise = $interval(() => {
          if (modules[module]) {
            $interval.cancel(promise);
            deferred.resolve(modules[module]);
          }
        }, 100);
        return deferred.promise;
      }
    };
  }]);

// -----------------------------------------------------------------------------
app.factory('commands', [
  'moduleLoader',
  function (moduleLoader) {
    var service = [];

    moduleLoader('commands').then(commands => {
      angular.copy(commands, service);
      service.loaded = true;
    });

    // Find a command by ID.
    service.findById = (id) => {
      return service.find(function (cmd) {
        return cmd.id === id;
      });
    };

    return service;
  }]);

// -----------------------------------------------------------------------------
// A wrapper around the settings module that presents itself as a hash of
// settings similar to the underlying module.
app.factory('settings', [
  '$q',
  'moduleLoader',
  function ($q, moduleLoader) {
    var templates = {};
    var service = {};

    // Get a promise chain that is resolved when the settings module is
    // available and settings have been loaded from storage.
    var promise = moduleLoader('settings').then(module => {
      // Copy default templates from the settings module.
      angular.copy(module.$templates, templates);

      // Copy loaded settings from the settings module.
      return module.loaded.then(() => angular.copy(module, service));
    });

    // Expose the default templates as a non-enumerable property.
    Object.defineProperty(service, '$templates', {
      enumerable: false,
      value: templates
    });

    // Expose a method to load settings from browser storage as a
    // non-enumerable property. Returns a promise that is resolved when
    // settings are loaded.
    Object.defineProperty(service, 'load', {
      enumerable: false,
      value: () => promise.then(() => service)
    });

    // Expose a method to save settings to browser storage as a
    // non-enumerable property. Returns a promise that is resolved when
    // settings are saved.
    Object.defineProperty(service, 'save', {
      enumerable: false,
      value: () => {
        var deferred = $q.defer();
        browser.storage.local.set(service).then(
          () => deferred.resolve(),
          err => deferred.reject(err));
        return deferred.promise;
      }
    });

    return service;
  }]);

// -----------------------------------------------------------------------------
app.controller('OptionsCtrl', [
  '$scope',
  'commands',
  'settings',
  function ($scope, commands, settings) {
    // Scope variables.
    $scope.commands = commands;
    $scope.settings = settings;
    $scope.settingsLoaded = false;
    $scope.controls = {
      fewerTrailOptions: true,
      fewerStatusOptions: true,
      gestureTimeout: 0.4,
      statusTimeout: 2.0
    };

    $scope.defaultStatusTemplate = settings.statusTemplate;

    // Initialize settings on load.
    settings.load().then(() => {
      var inSeconds;
      inSeconds = Math.floor(settings.gestureTimeout / 100) / 10;
      $scope.controls.gestureTimeout = inSeconds;
      inSeconds = Math.floor(settings.statusTimeout / 100) / 10;
      $scope.controls.statusTimeout = inSeconds;
      $scope.settingsLoaded = true;
      $scope.$broadcast('redraw');
      startWatchingSettings();
    });

    // Watch the settings object and persist it on changes.
    function startWatchingSettings() {
      $scope.$watch('settings', (newValue) => {
        if (newValue) {
          settings.save().then(() => $scope.$broadcast('redraw'));
        }
      }, true);
    }

    // Convert gesture timeout to milliseconds.
    $scope.$watch('controls.gestureTimeout', (newValue, oldValue) => {
      var inMillis = Math.floor(newValue * 10) * 100;
      settings.gestureTimeout = inMillis;
    });

    // Convert status timeout to milliseconds.
    $scope.$watch('controls.statusTimeout', (newValue, oldValue) => {
      var inMillis = Math.floor(newValue * 10) * 100;
      settings.statusTimeout = inMillis;
    });

    // Get the mapping for a command.
    $scope.getMappingForCommand = (command) => {
      var commandId = command.id || command;
      return settings.mouseMappings.find(mapping =>
        mapping.command === commandId);
    };

    // Get the mapping for a gesture.
    $scope.getMappingForGesture = (gesture) => {
      return settings.mouseMappings.find(mapping =>
        mapping.gesture === gesture);
    };

    // Remove the mapping for a gesture.
    $scope.removeMappingForGesture = (gesture) => {
      var index = settings.mouseMappings.findIndex(
        mapping => mapping.gesture === gesture);
      if (index >= 0) {
        settings.mouseMappings.splice(index, 1);
      }
    };

    // Remove the mapping for a command.
    $scope.removeMappingForCommand = (command) => {
      var index = settings.mouseMappings.findIndex(
        mapping => mapping.command === command.id);
      if (index >= 0) {
        settings.mouseMappings.splice(index, 1);
      }
    };

    // Re-assign a gesture.
    $scope.assignGesture = (gesture, command) => {
      if (!gesture) {
        $scope.removeMappingForCommand(command);
        return;
      }

      // Prompt when re-assigning a command.
      var assigned = $scope.getMappingForGesture(gesture);
      if (assigned && (assigned.command !== command.id)) {
        var oldCommand = commands.findById(assigned.command);
        if (oldCommand) {
          var prompt = modules.helpers.format(
            '{} is already mapped to {}. Re-assign to {}?',
            gesture, oldCommand.label, command.label);
          if (!window.confirm(prompt)) {
            // Cancel assignment.
            return;
          }
        }
      }

      // Remove the old mappings for this command.
      $scope.removeMappingForGesture(gesture);
      $scope.removeMappingForCommand(command);

      // Insert the new mapping for this gesture.
      settings.mouseMappings.push({
        command: command.id,
        gesture: gesture
      });
    };
  }]);

// -----------------------------------------------------------------------------
app.directive('mgGestureInput', [
  '$timeout',
  function ($timeout) {
    return {
      scope: {
        settings: '=',
        gesture: '=',
        onGesture: '&'
      },
      restrict: 'A',
      link: function (scope, element, attrs) {

        var canvas = element[0];
        var ctx = canvas.getContext('2d');
        var width = canvas.clientWidth;
        var height = canvas.clientHeight;

        // Gesture mapping
        // ---------------------------------------------------------------------

        drawGesture();

        // Repaint the gesture on settings changed.
        scope.$watch('settings', (newValue) => {
          ctx.lineWidth = scope.settings.trailWidth || 2;
          ctx.strokeStyle = scope.settings.trailColor || '#000';
          drawGesture();
        }, true);

        // Repaint the gesture on gesture changed.
        scope.$watch('gesture', () => drawGesture());

        // Draw a line with an arrowhead.
        function arrowTo (paths, x, y, direction) {
          var arrowSize = 3;
          var subpath = [];
          paths.push([x, y]);
          switch (direction) {
            case 'U':
              paths.push([x - arrowSize, y + arrowSize]);
              paths.push([x + arrowSize, y + arrowSize]);
              break;
            case 'D':
              paths.push([x - arrowSize, y - arrowSize]);
              paths.push([x + arrowSize, y - arrowSize]);
              break;
            case 'L':
              paths.push([x + arrowSize, y - arrowSize]);
              paths.push([x + arrowSize, y + arrowSize]);
              break;
            case 'R':
              paths.push([x - arrowSize, y - arrowSize]);
              paths.push([x - arrowSize, y + arrowSize]);
              break;
          }
          paths.push([x, y]);
          return paths;
        }

        // Get a path to draw a gesture.
        function getGesturePath (moves) {
          var offsetSize = 5, legSize = 30;
          var path = [], x = 0, y = 0;
          path.push([[0, 0]]);
          moves.forEach(function (move) {
            var subpath = [[x, y]];
            switch (move) {
              case 'U':
                y -= legSize - offsetSize;
                x += offsetSize;
                break;
              case 'D':
                y += legSize + offsetSize;
                x += offsetSize;
                break;
              case 'L':
                y -= offsetSize;
                x -= legSize - offsetSize;
                break;
              case 'R':
                y -= offsetSize;
                x += legSize - offsetSize;
                break;
            }
            arrowTo(subpath, x, y, move);
            path.push(subpath);
          });
          return path;
        }

        // Get the bounding rectangle for a path.
        function getPathBoundingRect (paths) {
          var bounds = paths.reduce(function (bounds, subpath) {
            subpath.forEach(point => {
              bounds.top = Math.min(bounds.top, point[1]);
              bounds.bottom = Math.max(bounds.bottom, point[1]);
              bounds.right = Math.max(bounds.right, point[0]);
              bounds.left = Math.min(bounds.left, point[0]);
            });
            return bounds;
          }, { top: 0, bottom: 0, left: 0, right: 0 });
          bounds.width = bounds.right - bounds.left;
          bounds.height = bounds.bottom - bounds.top;
          return bounds;
        }

        // Draw the gesture.
        function drawGesture () {
          clearCanvas();
          if (scope.gesture) {
            // Get one or more paths describing the gesture.
            var moves = scope.gesture.split('');
            var paths = getGesturePath(moves);

            // Determine the offset to center the paths.
            var bounds = getPathBoundingRect(paths);
            var offset = {
              x: (width / 2) - (bounds.width / 2) - bounds.left,
              y: (height / 2) - (bounds.height / 2) - bounds.top
            };

            // Apply the offset to all points in the paths.
            paths.forEach(subpath => subpath.forEach(point => {
              point[0] += offset.x;
              point[1] += offset.y;
            }));

            // Draw the paths in the gesture.
            var alpha = 0.33;
            paths.forEach(function (subpath) {
              ctx.beginPath();
              ctx.globalAlpha = alpha;
              subpath.forEach(point => ctx.lineTo(point[0], point[1]));
              ctx.stroke();
              alpha += 0.67 / (paths.length - 1);
            });
          }
        }

        // Clear the canvas.
        function clearCanvas () {
          ctx.clearRect(0, 0, width, height);
        }

        // Gesture input
        // ---------------------------------------------------------------------

        var state = {
          inProgress: false,
          mouseOut: false,
          x: 0,
          y: 0
        };

        var deltaAccumulator = new MouseDeltaAccumulator();
        var gestureDetector = new UDLRGestureDetector();

        element.on('mousedown', onMouseDown);
        element.on('mouseup', onMouseUp);
        element.on('mousemove', onMouseMove);
        element.on('mouseleave', onMouseLeave);
        window.addEventListener('contextmenu', onContextMenu);

        scope.$on('$destroy', function () {
          element.off('mousedown', onMouseDown);
          element.off('mouseup', onMouseUp);
          element.off('mousemove', onMouseMove);
          element.off('mouseleave', onMouseLeave);
          window.removeEventListener('contextmenu', onContextMenu);
        });

        function getMouseData (event) {
          return {
            button: event.button,
            x: event.offsetX,
            y: event.offsetY,
            dx: event.movementX,
            dy: event.movementY
          };
        }

        function onMouseDown (event) {
          var mouseDown = getMouseData(event);
          if (event.button === scope.settings.gestureButton) {
            state.inProgress = true;
            state.contextMenu = false;
            deltaAccumulator.reset();
            gestureDetector.reset();
            state.x = mouseDown.x;
            state.y = mouseDown.y;
            clearCanvas();
          }
        }

        function onMouseUp (event) {
          if (event.button === scope.settings.gestureButton) {
            state.inProgress = false;
            scope.$apply(() => {
              scope.onGesture({ gesture: gestureDetector.gesture });
              drawGesture();
            });
          }
        }

        function onMouseMove (event) {
          if (state.inProgress) {
            var mouseMove = getMouseData(event);
            deltaAccumulator.accumulate(mouseMove);
            if (modules.helpers.distanceDelta(mouseMove) >= scope.settings.gestureFidelity) {
              deltaAccumulator.reset();
              gestureDetector.addPoint(mouseMove);

              // Draw a segment on the canvas.
              ctx.beginPath();
              ctx.moveTo(state.x, state.y);
              state.x += mouseMove.dx;
              state.y += mouseMove.dy;
              ctx.lineTo(state.x, state.y);
              ctx.stroke();
            }
          }
        }

        function onContextMenu (event) {
          if (!state.contextMenu) {
            event.preventDefault();
            event.stopPropagation();
          }
          state.contextMenu = true;
        }

        // Cancel the gesture on mouse leave.
        function onMouseLeave () {
          if (state.inProgress) {
            state.inProgress = false;
            scope.$apply(() => drawGesture());
          }
        }

      }
    };
  }]);
