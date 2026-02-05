const User = require('../models/User');
const logger = require('../utils/logger');
const { uploadFile } = require('../services/fileService');
const { webhookService } = require('../services/webhookService');

// Submit KYC application
const submitKYC = async (req, res) => {
  try {
    const {
      business_name,
      business_description,
      physical_address,
      business_type,
      registration_number,
      tax_pin,
      contact_person,
      contact_person_phone,
      contact_person_email,
      expected_monthly_volume,
      documents
    } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if KYC is already submitted
    if (user.kyc_status === 'pending' || user.kyc_status === 'approved') {
      return res.status(400).json({
        error: 'KYC already submitted',
        kyc_status: user.kyc_status
      });
    }

    // Update user KYC information
    user.business_name = business_name || user.business_name;
    user.kyc_status = 'pending';
    user.kyc_details = {
      business_description,
      physical_address,
      business_type,
      registration_number,
      tax_pin,
      contact_person,
      contact_person_phone,
      contact_person_email,
      expected_monthly_volume,
      submitted_at: new Date()
    };

    // Process document uploads if provided
    if (documents && Object.keys(documents).length > 0) {
      for (const [docType, fileData] of Object.entries(documents)) {
        if (fileData) {
          try {
            const uploadedFile = await uploadFile(fileData, `kyc/${user._id}/${docType}`);
            user.kyc_documents[docType] = uploadedFile.url;
          } catch (uploadError) {
            logger.error(`Failed to upload ${docType}:`, uploadError);
            return res.status(400).json({
              error: `Failed to upload ${docType}`,
              message: uploadError.message
            });
          }
        }
      }
    }

    await user.save();

    // Send webhook notification
    try {
      await webhookService.sendKYCWebhook(user, 'submitted');
    } catch (webhookError) {
      logger.error('KYC webhook failed:', webhookError);
    }

    logger.info(`KYC submitted: ${user.email}`);

    res.json({
      message: 'KYC application submitted successfully',
      kyc_status: user.kyc_status,
      submitted_at: user.kyc_details.submitted_at,
      documents_uploaded: Object.keys(user.kyc_documents).filter(key => user.kyc_documents[key])
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to submit KYC application'
    });
  }
};

// Get KYC status
const getKYCStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('kyc_status kyc_details kyc_documents trust_score');

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      kyc_status: user.kyc_status,
      trust_score: user.trust_score,
      submitted_at: user.kyc_details?.submitted_at,
      documents_required: [
        'company_registration',
        'tax_certificate',
        'business_permit',
        'owner_id',
        'owner_selfie',
        'bank_statement'
      ],
      documents_uploaded: Object.keys(user.kyc_documents || {}).filter(key => user.kyc_documents[key]),
      missing_documents: [
        'company_registration',
        'tax_certificate',
        'business_permit',
        'owner_id',
        'owner_selfie',
        'bank_statement'
      ].filter(doc => !user.kyc_documents?.[doc])
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch KYC status'
    });
  }
};

// Upload KYC documents
const uploadDocuments = async (req, res) => {
  try {
    const { documents } = req.body; // Expected format: { document_type: file_data }

    if (!documents || typeof documents !== 'object') {
      return res.status(400).json({
        error: 'Documents data required'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if KYC is already approved
    if (user.kyc_status === 'approved') {
      return res.status(400).json({
        error: 'KYC already approved'
      });
    }

    const uploadedDocuments = {};
    const errors = {};

    // Process each document
    for (const [docType, fileData] of Object.entries(documents)) {
      if (!fileData) continue;

      try {
        const uploadedFile = await uploadFile(fileData, `kyc/${user._id}/${docType}`);
        user.kyc_documents[docType] = uploadedFile.url;
        uploadedDocuments[docType] = uploadedFile.url;
      } catch (uploadError) {
        errors[docType] = uploadError.message;
        logger.error(`Failed to upload ${docType}:`, uploadError);
      }
    }

    // Update KYC status if documents were uploaded and KYC wasn't submitted yet
    if (Object.keys(uploadedDocuments).length > 0 && user.kyc_status === 'not_submitted') {
      user.kyc_status = 'pending';
      user.kyc_details = {
        ...user.kyc_details,
        submitted_at: new Date()
      };
    }

    await user.save();

    // Send webhook if this is a complete submission
    const requiredDocs = ['company_registration', 'tax_certificate', 'business_permit', 'owner_id', 'owner_selfie', 'bank_statement'];
    const uploadedDocTypes = Object.keys(user.kyc_documents).filter(key => user.kyc_documents[key]);
    
    if (uploadedDocTypes.length === requiredDocs.length) {
      try {
        await webhookService.sendKYCWebhook(user, 'submitted');
      } catch (webhookError) {
        logger.error('KYC webhook failed:', webhookError);
      }
    }

    logger.info(`Documents uploaded for ${user.email}: ${Object.keys(uploadedDocuments).join(', ')}`);

    res.json({
      message: 'Documents uploaded successfully',
      uploaded_documents: uploadedDocuments,
      errors: Object.keys(errors).length > 0 ? errors : null,
      kyc_status: user.kyc_status,
      progress: {
        uploaded: uploadedDocTypes.length,
        required: requiredDocs.length,
        percentage: Math.round((uploadedDocTypes.length / requiredDocs.length) * 100)
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to upload documents'
    });
  }
};

// Get uploaded documents
const getDocuments = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('kyc_documents kyc_status');

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const documents = {};
    const documentTypes = [
      { key: 'company_registration', label: 'Company Registration Certificate' },
      { key: 'tax_certificate', label: 'Tax PIN Certificate' },
      { key: 'business_permit', label: 'Business Permit' },
      { key: 'owner_id', label: 'Owner National ID' },
      { key: 'owner_selfie', label: 'Owner Selfie with ID' },
      { key: 'bank_statement', label: 'Bank Statement (3 months)' }
    ];

    documentTypes.forEach(docType => {
      documents[docType.key] = {
        label: docType.label,
        uploaded: !!user.kyc_documents?.[docType.key],
        url: user.kyc_documents?.[docType.key] || null,
        required: true
      };
    });

    res.json({
      kyc_status: user.kyc_status,
      documents,
      upload_progress: {
        uploaded: Object.values(documents).filter(doc => doc.uploaded).length,
        required: documentTypes.length,
        percentage: Math.round((Object.values(documents).filter(doc => doc.uploaded).length / documentTypes.length) * 100)
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch documents'
    });
  }
};

// Update document
const updateDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { file_data } = req.body;

    if (!file_data) {
      return res.status(400).json({
        error: 'File data required'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if KYC is already approved
    if (user.kyc_status === 'approved') {
      return res.status(400).json({
        error: 'KYC already approved'
      });
    }

    // Validate document type
    const validDocumentTypes = [
      'company_registration',
      'tax_certificate',
      'business_permit',
      'owner_id',
      'owner_selfie',
      'bank_statement'
    ];

    if (!validDocumentTypes.includes(documentId)) {
      return res.status(400).json({
        error: 'Invalid document type'
      });
    }

    // Upload new document
    try {
      const uploadedFile = await uploadFile(file_data, `kyc/${user._id}/${documentId}`);
      user.kyc_documents[documentId] = uploadedFile.url;
      
      // Update KYC status if this completes the submission
      if (user.kyc_status === 'not_submitted') {
        user.kyc_status = 'pending';
        user.kyc_details = {
          ...user.kyc_details,
          submitted_at: new Date()
        };
      }

      await user.save();

      logger.info(`Document updated for ${user.email}: ${documentId}`);

      res.json({
        message: 'Document updated successfully',
        document_type: documentId,
        url: uploadedFile.url,
        kyc_status: user.kyc_status
      });

    } catch (uploadError) {
      logger.error(`Failed to update document ${documentId}:`, uploadError);
      res.status(400).json({
        error: 'Failed to upload document',
        message: uploadError.message
      });
    }

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to update document'
    });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if KYC is already approved
    if (user.kyc_status === 'approved') {
      return res.status(400).json({
        error: 'Cannot delete documents after KYC approval'
      });
    }

    // Validate document type
    const validDocumentTypes = [
      'company_registration',
      'tax_certificate',
      'business_permit',
      'owner_id',
      'owner_selfie',
      'bank_statement'
    ];

    if (!validDocumentTypes.includes(documentId)) {
      return res.status(400).json({
        error: 'Invalid document type'
      });
    }

    // Delete document
    if (user.kyc_documents?.[documentId]) {
      delete user.kyc_documents[documentId];
      
      // Update KYC status if no documents remain
      const uploadedDocs = Object.keys(user.kyc_documents).filter(key => user.kyc_documents[key]);
      if (uploadedDocs.length === 0) {
        user.kyc_status = 'not_submitted';
      }

      await user.save();

      logger.info(`Document deleted for ${user.email}: ${documentId}`);
    }

    res.json({
      message: 'Document deleted successfully',
      document_type: documentId,
      kyc_status: user.kyc_status
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to delete document'
    });
  }
};

module.exports = {
  submitKYC,
  getKYCStatus,
  uploadDocuments,
  getDocuments,
  updateDocument,
  deleteDocument
};
