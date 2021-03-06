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

const { matrixReduce } = require('../src/index.js');
const { createWrappedEventAction } = require('../src/wrappedSync.js');

const { expect } = require('chai');

const { MatrixEvent, Room, RoomMember } = require('matrix-js-sdk');

const {
    createWrappedAPISuccessAction,
    createWrappedAPIFailureAction,
    createWrappedAPIPendingAction,
} = require('../src/wrappedAPI.js');

function runActionsAndExpectState(actions, expected) {
    let actual;
    actions.forEach((action) => {
        actual = matrixReduce(action, actual);
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

describe('the matrix redux wrap reducer', () => {
    it('is a function', () => {
        expect(matrixReduce).to.be.a('function');
    });

    it('returns initial state when given the undefined action', () => {
        runActionsAndExpectState(
            [undefined],
            { mrw: { wrapped_api: {}, wrapped_state: { rooms: {}, sync: {} } } },
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
                    wrapped_state: { rooms: {}, sync: {} },
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
                    wrapped_state: { rooms: {}, sync: {} },
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
                createWrappedEventAction('Room', [new Room('!myroomid')]),
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
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });
    });

    describe('wraps matris-js-sdk state emitted as events such that it', () => {
        it('handles new rooms sent to the client', () => {
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles multiple new rooms sent to the client', () => {
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('Room', [new Room('!someotherroomid')]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                            '!someotherroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('updates room names', () => {
            const namedRoom = new Room('!myroomid');
            namedRoom.name = 'This is a room name';
            const actions = [
                undefined,
                createWrappedEventAction('Room.name', [namedRoom]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: 'This is a room name',
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles a new room followed by a room name change', () => {
            const namedRoom = new Room('!myroomid');
            namedRoom.name = 'This is a room name';
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('Room.name', [namedRoom]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: 'This is a room name',
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles a room name change followed by a new room', () => {
            const namedRoom = new Room('!myroomid');
            namedRoom.name = 'This is a room name';
            const actions = [
                undefined,
                createWrappedEventAction('Room.name', [namedRoom]),
                createWrappedEventAction('Room', [new Room('!myroomid')]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: 'This is a room name',
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles a new room followed by two room name changes', () => {
            const namedRoom = new Room('!myroomid');
            namedRoom.name = 'This is a room name';
            const secondNamedRoom = new Room('!myroomid');
            secondNamedRoom.name = 'Some other crazy name';
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('Room.name', [namedRoom]),
                createWrappedEventAction('Room.name', [secondNamedRoom]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: 'Some other crazy name',
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
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
                createWrappedEventAction('Room', [new Room('!myroomid')]),
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
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('tracks sync state', () => {
            const actions = [
                undefined,
                createWrappedEventAction('sync', ['SYNCING']),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {},
                        sync: {
                            state: 'SYNCING',
                        },
                    },
                },
            });
        });

        it('handles new room members', () => {
            const member = new RoomMember('!myroomid', '@userid:domain');
            const event = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.member',
                content: {
                    avatar_url: 'mxc://someavatarurl',
                    membership: 'join',
                },
            });
            member.setMembershipEvent(event);
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('RoomMember.membership', [event, member]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                                members: {
                                    '@userid:domain': {
                                        membership: 'join',
                                        name: '@userid:domain',
                                        avatarUrl: 'mxc://someavatarurl',
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles new room members, with name changes', () => {
            const member = new RoomMember('!myroomid', '@userid:domain');
            const event = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.member',
                content: {
                    membership: 'join',
                },
            });
            const nameEvent = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.member',
                content: {
                    membership: 'join',
                    displayname: 'Neo',
                },
            });
            member.setMembershipEvent(nameEvent);
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('RoomMember.membership', [event, member]),
                createWrappedEventAction('RoomMember.name', [nameEvent, member]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                                members: {
                                    '@userid:domain': {
                                        avatarUrl: undefined,
                                        membership: 'join',
                                        name: 'Neo',
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles multiple room members', () => {
            const memberA = new RoomMember('!myroomid', '@userid1:domain');
            const memberB = new RoomMember('!myroomid', '@userid2:domain');
            const eventA = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.member',
                content: {
                    membership: 'join',
                    displayname: 'Morpheus',
                },
            });
            const eventB = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.member',
                content: {
                    membership: 'join',
                    displayname: 'Trinity',
                },
            });
            memberA.setMembershipEvent(eventA);
            memberB.setMembershipEvent(eventB);
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('RoomMember.membership', [eventA, memberA]),
                createWrappedEventAction('RoomMember.membership', [eventB, memberB]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {},
                                members: {
                                    '@userid1:domain': {
                                        avatarUrl: undefined,
                                        membership: 'join',
                                        name: 'Morpheus',
                                    },
                                    '@userid2:domain': {
                                        avatarUrl: undefined,
                                        membership: 'join',
                                        name: 'Trinity',
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('inserts events into the timeline', () => {
            const event = new MatrixEvent({
                event_id: 'some_event_id',
                room_id: '!myroomid',
                type: 'm.room.message',
                content: {
                    body: 'Hello, world!',
                },
                sender: '@userid:domain',
                origin_server_ts: 12345,
            });
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('Room.timeline', [event]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [{
                                    id: 'some_event_id',
                                    type: 'm.room.message',
                                    prevContent: {},
                                    content: { body: 'Hello, world!' },
                                    sender: '@userid:domain',
                                    ts: 12345,
                                    redactedBecause: undefined,
                                }],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('inserts multiple events into the timeline', () => {
            const eventA = new MatrixEvent({
                event_id: 'some_event_id',
                room_id: '!myroomid',
                type: 'm.room.message',
                content: {
                    body: 'Hello, world!',
                },
                sender: '@userid:domain',
                origin_server_ts: 12345,
            });
            const eventB = new MatrixEvent({
                event_id: 'some_other_event_id',
                room_id: '!myroomid',
                type: 'm.room.message',
                content: {
                    body: 'Hello (again), world!',
                },
                sender: '@userid:domain',
                origin_server_ts: 123456,
            });
            const actions = [
                undefined,
                createWrappedEventAction('Room', [new Room('!myroomid')]),
                createWrappedEventAction('Room.timeline', [eventA]),
                createWrappedEventAction('Room.timeline', [eventB]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [{
                                    id: 'some_event_id',
                                    type: 'm.room.message',
                                    content: { body: 'Hello, world!' },
                                    prevContent: {},
                                    sender: '@userid:domain',
                                    ts: 12345,
                                    redactedBecause: undefined,
                                }, {
                                    id: 'some_other_event_id',
                                    type: 'm.room.message',
                                    content: { body: 'Hello (again), world!' },
                                    prevContent: {},
                                    sender: '@userid:domain',
                                    ts: 123456,
                                    redactedBecause: undefined,
                                }],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles state events', () => {
            const eventA = new MatrixEvent({
                room_id: '!myroomid',
                type: 'c.some.state',
                content: {
                    state: 'awesome',
                },
                sender: '@userid:domain',
                state_key: 'apples',
                origin_server_ts: 12345,
            });
            const eventB = new MatrixEvent({
                room_id: '!myroomid',
                type: 'c.some.other.state',
                content: {
                    state: 'wow',
                },
                sender: '@userid:domain',
                state_key: 'bananas',
                origin_server_ts: 123456,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                createWrappedEventAction('Room', [room]),
                createWrappedEventAction('RoomState.events', [eventA, room]),
                createWrappedEventAction('RoomState.events', [eventB, room]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                receipts: {},
                                state: {
                                    'c.some.other.state': {
                                        bananas: {
                                            id: undefined,
                                            redactedBecause: undefined,
                                            content: {
                                                state: 'wow',
                                            },
                                            sender: '@userid:domain',
                                            ts: 123456,
                                            type: 'c.some.other.state',
                                        },
                                    },
                                    'c.some.state': {
                                        apples: {
                                            id: undefined,
                                            redactedBecause: undefined,
                                            content: {
                                                state: 'awesome',
                                            },
                                            sender: '@userid:domain',
                                            ts: 12345,
                                            type: 'c.some.state',
                                        },
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles state changes', () => {
            const eventA = new MatrixEvent({
                room_id: '!myroomid',
                type: 'c.some.state',
                content: {
                    state: 'awesome',
                },
                sender: '@userid:domain',
                state_key: 'apples',
                origin_server_ts: 12345,
            });
            const eventB = new MatrixEvent({
                room_id: '!myroomid',
                type: 'c.some.state',
                content: {
                    state: 'wow',
                },
                sender: '@userid:domain',
                state_key: 'apples',
                origin_server_ts: 123456,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                createWrappedEventAction('Room', [room]),
                createWrappedEventAction('RoomState.events', [eventA, room]),
                createWrappedEventAction('RoomState.events', [eventB, room]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                receipts: {},
                                state: {
                                    'c.some.state': {
                                        apples: {
                                            id: undefined,
                                            redactedBecause: undefined,
                                            content: {
                                                state: 'wow',
                                            },
                                            sender: '@userid:domain',
                                            ts: 123456,
                                            type: 'c.some.state',
                                        },
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles read receipts', () => {
            const event = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.receipt',
                content: {
                    $some_event_id: {
                        'some.receipt.type': {
                            '@userid:domain': {
                                ts: 12345,
                            },
                        },
                    },
                },
                sender: '@userid:domain',
                origin_server_ts: 12345,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                createWrappedEventAction('Room', [room]),
                createWrappedEventAction('Room.receipt', [event]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                state: {},
                                receipts: {
                                    $some_event_id: {
                                        'some.receipt.type': {
                                            '@userid:domain': {
                                                ts: 12345,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles timeline event redactions', () => {
            const event = new MatrixEvent({
                event_id: '$some_event_id',
                room_id: '!myroomid',
                type: 'm.some.event',
                content: {
                    thisShouldBeRedacted: 'test test 1 2 3',
                },
                sender: '@userid:domain',
                origin_server_ts: 12345,
            });
            const redactionEvent = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.redaction',
                redacts: '$some_event_id',
                sender: '@userid:domain',
                origin_server_ts: 123456,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                createWrappedEventAction('Room', [room]),
                createWrappedEventAction('Room.timeline', [event]),
                createWrappedEventAction('Room.redaction', [redactionEvent]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [{
                                    id: '$some_event_id',
                                    type: 'm.some.event',
                                    content: {},
                                    prevContent: {},
                                    redactedBecause: {
                                        sender: '@userid:domain',
                                        content: {},
                                        ts: 123456,
                                    },
                                    sender: '@userid:domain',
                                    ts: 12345,
                                }],
                                state: {},
                                receipts: {},
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles state event redactions', () => {
            const event = new MatrixEvent({
                event_id: '$some_event_id',
                room_id: '!myroomid',
                type: 'c.some.state',
                content: {
                    state: 'awesome',
                },
                sender: '@userid:domain',
                state_key: 'apples',
                origin_server_ts: 12345,
            });
            const redactionEvent = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.redaction',
                redacts: '$some_event_id',
                sender: '@userid:domain',
                origin_server_ts: 123456,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                createWrappedEventAction('Room', [room]),
                createWrappedEventAction('RoomState.events', [event, room]),
                createWrappedEventAction('Room.redaction', [redactionEvent]),
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                receipts: {},
                                state: {
                                    'c.some.state': {
                                        apples: {
                                            id: '$some_event_id',
                                            content: {},
                                            sender: '@userid:domain',
                                            ts: 12345,
                                            type: 'c.some.state',
                                            redactedBecause: {
                                                sender: '@userid:domain',
                                                content: {},
                                                ts: 123456,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });

        it('handles mrw.wrapped_event.series actions', () => {
            const event = new MatrixEvent({
                event_id: '$some_event_id',
                room_id: '!myroomid',
                type: 'c.some.state',
                content: {
                    state: 'awesome',
                },
                sender: '@userid:domain',
                state_key: 'apples',
                origin_server_ts: 12345,
            });
            const redactionEvent = new MatrixEvent({
                room_id: '!myroomid',
                type: 'm.room.redaction',
                redacts: '$some_event_id',
                sender: '@userid:domain',
                origin_server_ts: 123456,
            });
            const room = new Room('!myroomid');
            const actions = [
                undefined,
                {
                    type: 'mrw.wrapped_event.series',
                    series: [
                        createWrappedEventAction('Room', [room]),
                        createWrappedEventAction('RoomState.events', [event, room]),
                        createWrappedEventAction('Room.redaction', [redactionEvent]),
                    ],
                },
            ];
            runActionsAndExpectState(actions, {
                mrw: {
                    wrapped_api: {},
                    wrapped_state: {
                        rooms: {
                            '!myroomid': {
                                members: {},
                                name: null,
                                timeline: [],
                                receipts: {},
                                state: {
                                    'c.some.state': {
                                        apples: {
                                            id: '$some_event_id',
                                            content: {},
                                            sender: '@userid:domain',
                                            ts: 12345,
                                            type: 'c.some.state',
                                            redactedBecause: {
                                                sender: '@userid:domain',
                                                content: {},
                                                ts: 123456,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        sync: {},
                    },
                },
            });
        });
    });
});
