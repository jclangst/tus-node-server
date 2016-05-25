/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const request = require('supertest');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs');
const Server = require('../lib/Server');
const FileStore = require('../lib/stores/FileStore');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

const STORE_PATH = '/files';

const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`);
const TEST_FILE_SIZE = 960244;
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const TEST_METADATA = 'some data, for you';

describe('EndToEnd', () => {
    let server;
    let agent;
    describe('FileStore', () => {
        let file_id;
        let deferred_file_id;
        before(() => {
            server = new Server();
            server.datastore = new FileStore({
                path: STORE_PATH,
            });
            agent = request.agent(server.listen());
        });
        after((done) => {
            // Remove the files directory
            exec(`rm -r ${FILES_DIRECTORY}`, (err) => {
                if (err) {
                    return done(err);
                }

                // clear the config
                server.datastore.configstore.clear();
                return done();
            });
        });
        describe('HEAD', () => {
            it('should 404 the files that doesnt exist yet', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', 960244)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('POST', () => {
            it('should create a file and respond with a location', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', 960244)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);

                    // Save the id for subsequent tests
                    file_id = res.headers.location.split('/').pop();
                    done();
                });
            });

            it('should create a file with a deferred length', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Defer-Length', 1)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);

                    // Save the id for subsequent tests
                    deferred_file_id = res.headers.location.split('/').pop();
                    done();
                });
            });
        });

        describe('HEAD', () => {
            it('should return a starting offset and metadata for a new file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', 0)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should return the defer length of the deferred file', (done) => {
                agent.head(`${STORE_PATH}/${deferred_file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Offset', 0)
                .expect('Upload-Defer-Length', 1)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('PATCH', () => {
            it('should 404 paths without a file id', (done) => {
                agent.patch(`${STORE_PATH}/`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should 404 paths that do not exist', (done) => {
                agent.patch(`${STORE_PATH}/dont_exist`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should upload the file', (done) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.patch(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Content-Type', 'application/offset+octet-stream');

                write_stream.on('response', (res) => {
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });

                read_stream.pipe(write_stream);
            });
        });

        describe('HEAD', () => {
            it('should return the ending offset of the file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', TEST_FILE_SIZE)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });
    });
});