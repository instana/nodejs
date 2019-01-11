/* eslint-disable */

// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var test_pb = require('./test_pb.js');

function serialize_instana_node_grpc_test_TestReply(arg) {
  if (!(arg instanceof test_pb.TestReply)) {
    throw new Error('Expected argument of type instana.node.grpc.test.TestReply');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_instana_node_grpc_test_TestReply(buffer_arg) {
  return test_pb.TestReply.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_instana_node_grpc_test_TestRequest(arg) {
  if (!(arg instanceof test_pb.TestRequest)) {
    throw new Error('Expected argument of type instana.node.grpc.test.TestRequest');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_instana_node_grpc_test_TestRequest(buffer_arg) {
  return test_pb.TestRequest.deserializeBinary(new Uint8Array(buffer_arg));
}


var TestServiceService = exports.TestServiceService = {
  makeUnaryCall: {
    path: '/instana.node.grpc.test.TestService/MakeUnaryCall',
    requestStream: false,
    responseStream: false,
    requestType: test_pb.TestRequest,
    responseType: test_pb.TestReply,
    requestSerialize: serialize_instana_node_grpc_test_TestRequest,
    requestDeserialize: deserialize_instana_node_grpc_test_TestRequest,
    responseSerialize: serialize_instana_node_grpc_test_TestReply,
    responseDeserialize: deserialize_instana_node_grpc_test_TestReply,
  },
  startServerSideStreaming: {
    path: '/instana.node.grpc.test.TestService/StartServerSideStreaming',
    requestStream: false,
    responseStream: true,
    requestType: test_pb.TestRequest,
    responseType: test_pb.TestReply,
    requestSerialize: serialize_instana_node_grpc_test_TestRequest,
    requestDeserialize: deserialize_instana_node_grpc_test_TestRequest,
    responseSerialize: serialize_instana_node_grpc_test_TestReply,
    responseDeserialize: deserialize_instana_node_grpc_test_TestReply,
  },
  startClientSideStreaming: {
    path: '/instana.node.grpc.test.TestService/StartClientSideStreaming',
    requestStream: true,
    responseStream: false,
    requestType: test_pb.TestRequest,
    responseType: test_pb.TestReply,
    requestSerialize: serialize_instana_node_grpc_test_TestRequest,
    requestDeserialize: deserialize_instana_node_grpc_test_TestRequest,
    responseSerialize: serialize_instana_node_grpc_test_TestReply,
    responseDeserialize: deserialize_instana_node_grpc_test_TestReply,
  },
  startBidiStreaming: {
    path: '/instana.node.grpc.test.TestService/StartBidiStreaming',
    requestStream: true,
    responseStream: true,
    requestType: test_pb.TestRequest,
    responseType: test_pb.TestReply,
    requestSerialize: serialize_instana_node_grpc_test_TestRequest,
    requestDeserialize: deserialize_instana_node_grpc_test_TestRequest,
    responseSerialize: serialize_instana_node_grpc_test_TestReply,
    responseDeserialize: deserialize_instana_node_grpc_test_TestReply,
  },
};

exports.TestServiceClient = grpc.makeGenericClientConstructor(TestServiceService);
