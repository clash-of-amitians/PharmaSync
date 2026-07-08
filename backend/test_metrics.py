import unittest
from app.core.metrics import PIPELINE_BANDWIDTH, ACTIVE_BUILDS
from prometheus_client import REGISTRY

class TestMetricsRegistry(unittest.TestCase):
    
    def test_bandwidth_counter(self):
        # Initial value check
        before = REGISTRY.get_sample_value(
            'cicd_pipeline_bandwidth_bytes_total', 
            {'direction': 'download', 'pipeline_id': 'test-backend', 'step': 'fetch_deps'}
        ) or 0
        
        # Increment counter
        PIPELINE_BANDWIDTH.labels(direction='download', pipeline_id='test-backend', step='fetch_deps').inc(1024)
        
        after = REGISTRY.get_sample_value(
            'cicd_pipeline_bandwidth_bytes_total', 
            {'direction': 'download', 'pipeline_id': 'test-backend', 'step': 'fetch_deps'}
        )
        
        self.assertEqual(after - before, 1024)

    def test_active_builds_gauge(self):
        # Set gauge value
        ACTIVE_BUILDS.labels(pipeline_id='build-ui').set(5)
        
        val = REGISTRY.get_sample_value(
            'cicd_pipeline_active_builds', 
            {'pipeline_id': 'build-ui'}
        )
        
        self.assertEqual(val, 5)
        
        # Decrement gauge value
        ACTIVE_BUILDS.labels(pipeline_id='build-ui').dec(2)
        
        val_after = REGISTRY.get_sample_value(
            'cicd_pipeline_active_builds', 
            {'pipeline_id': 'build-ui'}
        )
        
        self.assertEqual(val_after, 3)

    def test_order_events_metrics(self):
        from app.services.failed_event_service import process_order_event, set_network_status
        
        set_network_status(True)
        
        before_success = REGISTRY.get_sample_value(
            'order_events_processed_total',
            {'event_type': 'OrderCreated', 'status': 'SUCCESS'}
        ) or 0
        
        process_order_event('EVT-TEST-1', 'OrderCreated', {'simulate_failure': False})
        
        after_success = REGISTRY.get_sample_value(
            'order_events_processed_total',
            {'event_type': 'OrderCreated', 'status': 'SUCCESS'}
        )
        
        self.assertEqual(after_success - before_success, 1)
        
        # Test failure tracking
        before_failure = REGISTRY.get_sample_value(
            'order_events_processed_total',
            {'event_type': 'OrderCreated', 'status': 'FAILURE'}
        ) or 0
        
        with self.assertRaises(Exception):
            process_order_event('EVT-TEST-2', 'OrderCreated', {'simulate_failure': True})
            
        after_failure = REGISTRY.get_sample_value(
            'order_events_processed_total',
            {'event_type': 'OrderCreated', 'status': 'FAILURE'}
        )
        
        self.assertEqual(after_failure - before_failure, 1)

if __name__ == "__main__":
    unittest.main()
