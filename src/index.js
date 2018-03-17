/*

Copyright 2018 Luke Barnard

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

function isMatrixReduxAction(action) {
    return action &&
        action.type && typeof action.type === 'string' &&
        action.type.startsWith('mrw');
}

function reduceWrappedAPIAction(action, path, state) {
    const prevState = state.mrw.wrapped_api;
    const status = path[1];

    const apiState = Object.assign(
        state.mrw.wrapped_api[action.method] || {},
        {
            status, // pending/success/failure
            loading: status === 'pending',
        },
    );

    switch (status) {
    case 'success': {
        apiState.lastResult = action.result;
        break;
    }
    case 'failure': {
        apiState.lastError = action.error;
        break;
    }
    case 'pending': {
        apiState.lastArgs = action.args;
        break;
    }
    default:
        break;
    }

    const newState = Object.assign(prevState, {
        [action.method]: apiState,
    });

    return Object.assign(state, {
        mrw: { wrapped_state: state.mrw.wrapped_state, wrapped_api: newState },
    });
}

function reduceWrappedEventAction(action, state) {
    switch (action.eventType) {
    case 'Room': {
        const { roomId } = action.room;
        const prevState = Object.assign(
            {},
            state.mrw.wrapped_state.rooms[roomId] || {},
        );

        const newState = Object.assign(prevState, {
            name: null,
        });

        return Object.assign(state, {
            mrw: { wrapped_state: { rooms: { [roomId]: newState } }, wrapped_api: state.mrw.wrapped_api },
        });
    }
    case 'Room.name': {
        const roomId = action.event.getRoomId();
        const prevState = Object.assign(
            {},
            state.mrw.wrapped_state.rooms[roomId] || {},
        );

        const newState = Object.assign(prevState, {
            name: action.event.getContent().name,
        });

        return Object.assign(state, {
            mrw: { wrapped_state: { rooms: { [roomId]: newState } }, wrapped_api: state.mrw.wrapped_api },
        });
    }
    default:
        return state;
    }
}

function initialState() {
    return { mrw: { wrapped_api: {}, wrapped_state: { rooms: {} } } };
}

function MatrixReducer(action, state) {
    if (action === undefined) {
        return initialState();
    }
    if (!isMatrixReduxAction(action)) return state;

    const path = action.type.split('.').slice(1);

    // path[0]: 'wrapped_event' OR 'wrapped_api'

    switch (path[0]) {
    case 'wrapped_event':
        return reduceWrappedEventAction(action, state);
    case 'wrapped_api':
        return reduceWrappedAPIAction(action, path, state);
    default:
        throw new Error(`Unsupported mrw type ${path[0]}`);
    }
}

module.exports = {
    MatrixReducer,
};
