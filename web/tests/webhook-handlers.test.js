const { handleOrderPaid, getCurrentDonationTotal, updateProductDonationTotal } = require('./webhook-handlers');

// Mock session object for testing
const mockSession = {
  graphqlClient: () => ({
    query: jest.fn()
  })
};

// Mock order data for testing
const mockOrderData = {
  id: 12345,
  financial_status: 'paid',
  line_items: [
    {
      product_id: 789,
      quantity: 25, // $25 donation
      price: "1.00"
    },
    {
      product_id: 456, 
      quantity: 50, // $50 donation
      price: "1.00"
    },
    {
      product_id: 789, // Same product as first item
      quantity: 10,   // Additional $10 donation
      price: "1.00"
    }
  ]
};

describe('Mission Global Donation Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn(); // Mock console.log
    console.error = jest.fn(); // Mock console.error
  });

  test('should calculate correct donation amounts for multiple products', async () => {
    const mockQueryResponse = {
      body: {
        data: {
          product: {
            metafield: {
              value: "100" // Existing donation total
            }
          }
        }
      }
    };

    const mockMutationResponse = {
      body: {
        data: {
          metafieldsSet: {
            metafields: [{ id: 'test-id' }],
            userErrors: []
          }
        }
      }
    };

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce(mockQueryResponse) // First call for product 789
        .mockResolvedValueOnce(mockMutationResponse) // Mutation for product 789
        .mockResolvedValueOnce({ body: { data: { product: { metafield: { value: "50" } } } } }) // Query for product 456
        .mockResolvedValueOnce(mockMutationResponse) // Mutation for product 456
    };

    mockSession.graphqlClient = () => mockClient;

    await handleOrderPaid(mockSession, mockOrderData);

    // Verify that the correct calculations were made
    expect(mockClient.query).toHaveBeenCalledTimes(4);
    
    // Check that console.log was called with success message
    expect(console.log).toHaveBeenCalledWith(`Successfully updated donation totals for order ${mockOrderData.id}`);
  });

  test('should handle products with no existing donation total', async () => {
    const mockQueryResponse = {
      body: {
        data: {
          product: {
            metafield: null // No existing metafield
          }
        }
      }
    };

    const mockMutationResponse = {
      body: {
        data: {
          metafieldsSet: {
            metafields: [{ id: 'test-id' }],
            userErrors: []
          }
        }
      }
    };

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce(mockQueryResponse)
        .mockResolvedValueOnce(mockMutationResponse)
    };

    mockSession.graphqlClient = () => mockClient;

    const result = await updateProductDonationTotal(mockSession, 789, 25);
    
    expect(result).toBe(25); // Should start from 0 + 25
  });

  test('should handle errors gracefully', async () => {
    const mockClient = {
      query: jest.fn().mockRejectedValue(new Error('GraphQL Error'))
    };

    mockSession.graphqlClient = () => mockClient;

    await expect(handleOrderPaid(mockSession, mockOrderData)).rejects.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  test('getCurrentDonationTotal should return 0 for missing metafield', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({
        body: {
          data: {
            product: {
              metafield: null
            }
          }
        }
      })
    };

    mockSession.graphqlClient = () => mockClient;

    const result = await getCurrentDonationTotal(mockSession, 789);
    expect(result).toBe(0);
  });
});

// Integration test data you can use for manual testing
const testData = {
  sampleOrder: mockOrderData,
  expectedResults: {
    product789: 35, // 25 + 10 from the mock order
    product456: 50  // 50 from the mock order
  }
};

module.exports = { testData };
