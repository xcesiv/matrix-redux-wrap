/* global describe it */
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

const { MatrixReducer } = require('../src/index.js');
const { expect } = require('chai');

const { MatrixEvent, Room } = require('matrix-js-sdk');

const {
    createWrappedAPISuccessAction,
    createWrappedAPIFailureAction,
    createWrappedAPIPendingAction,
} = require('../src/wrappedAPI.js');

function runActionsAndExpectState(actions, expected) {
    let actual;
    actions.forEach((action) => {
        actual = MatrixReducer(action, actual);
    });
    expect(actual).to.eql(expected);
}

function createWrappedAPIActions(method, pendingState) {
    const id = Math.random().toString(16).slice(2);

    const actions = [createWrappedAPIPendingAction(method, pendingState, id)];
    return {
        succeed: (result) => {
            actions.push(createWrappedAPISuccessAction(method, result, id));
            return actions;
        },
        fail: (error) => {
            actions.push(createWrappedAPIFailureAction(method, error, id));
            return actions;
        },
    };
}

function createWrappedEventAction(eventType, args) {
    return { type: 'mrw.wrapped_event', eventType, ...args };
}

describe('the matrix redux wrap reducer', () => {
    it('is a function', () => {
        expect(MatrixReducer).to.be.a('function');
    });

    it('returns initial state when given the undefined action', () => {
        runActionsAndExpectState(
            [undefined],
            { mrw: { wrapped_api: {}, wrapped_state: { rooms: {} } } },
        );
    });

    describe('wraps promise-based APIs such that it', () => {
        it('keeps the status of a call to the API as state', () => {
            const actions = [
                undefined,
                ...createWrappedAPIActions('login', ['username', 'password']).succeed({
                    access_token: '12345',
                }),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_state: { rooms: {} },
                    wrapped_api: {
                        login: {
                            loading: false,
                            status: 'success',
                            pendingState: ['username', 'password'],
                            lastResult: {
                                access_token: '12345',
                            },
                        },
                    },
                },
            });
        });

        it('reflects multiple APIs as state', () => {
            const actions = [
                undefined,
                ...createWrappedAPIActions('login', ['username', 'password']).succeed({
                    access_token: '12345',
                }),
                ...createWrappedAPIActions('logout').succeed({
                    msg: 'Logout complete.',
                }),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_state: { rooms: {} },
                    wrapped_api: {
                        login: {
                            loading: false,
                            status: 'success',
                            pendingState: ['username', 'password'],
                            lastResult: {
                                access_token: '12345',
                            },
                        },
                        logout: {
                            loading: false,
                            status: 'success',
                            pendingState: undefined,
                            lastResult: {
                                msg: 'Logout complete.',
                            },
                        },
                    },
                },
            });
        });

        it('doesn\'t affect the wrapped_event state', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
                ...createWrappedAPIActions('some_promise_api', [12345]).succeed({
                    result: 'some result',
                }),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {
                        some_promise_api: {
                            loading: false,
                            status: 'success',
                            pendingState: [12345],
                            lastResult: {
                                result: 'some result',
                            },
                        },
                    },
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                            },
                        },
                    },
                },
            });
        });
    });

    describe('wraps matris-js-sdk state emitted as events such that it', () => {
        it('handles new rooms sent to the client', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                            },
                        },
                    },
                },
            });
        });

        it('handles multiple new rooms sent to the client', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!someotherroomid'),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                            },
                            '!someotherroomid': {
                                name: null,
                            },
                        },
                    },
                },
            });
        });

        it('updates room names', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room.name',
                    {
                        event: new MatrixEvent({
                            type: 'm.room.name',
                            content: {
                                name: 'This is a room name',
                            },
                            room_id: '!myroomid',
                        }),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: 'This is a room name',
                            },
                        },
                    },
                },
            });
        });

        it('handles a new room followed by a room name change', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
                createWrappedEventAction(
                    'Room.name',
                    {
                        event: new MatrixEvent({
                            type: 'm.room.name',
                            content: {
                                name: 'This is a room name',
                            },
                            room_id: '!myroomid',
                        }),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: 'This is a room name',
                            },
                        },
                    },
                },
            });
        });

        it('handles a new room followed by two room name changes', () => {
            const actions = [
                undefined,
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
                createWrappedEventAction(
                    'Room.name',
                    {
                        event: new MatrixEvent({
                            type: 'm.room.name',
                            content: {
                                name: 'This is a room name',
                            },
                            room_id: '!myroomid',
                        }),
                    },
                ),
                createWrappedEventAction(
                    'Room.name',
                    {
                        event: new MatrixEvent({
                            type: 'm.room.name',
                            content: {
                                name: 'Some other crazy name',
                            },
                            room_id: '!myroomid',
                        }),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: 'Some other crazy name',
                            },
                        },
                    },
                },
            });
        });

        it('doesn\'t affect the wrapped_api state', () => {
            const actions = [
                undefined,
                ...createWrappedAPIActions('some_promise_api', [12345]).succeed({
                    result: 'some result',
                }),
                createWrappedEventAction(
                    'Room',
                    {
                        room: new Room('!myroomid'),
                    },
                ),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {
                        some_promise_api: {
                            loading: false,
                            status: 'success',
                            pendingState: [12345],
                            lastResult: {
                                result: 'some result',
                            },
                        },
                    },
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                            },
                        },
                    },
                },
            });
        });
    });
});
