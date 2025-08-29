import { WalletTransaction } from "../models/walletTransaction.model.js";
import { User } from "../models/user.model.js";
import { Withdrawal } from "../models/withdrawal.model.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js"

const addMoneyToWallet = asyncHandler(async (req, res) => {
    const { amount, method, isPaid } = req.body;

    if (!amount || amount <= 0) {
        throw new apiError(400, "Invalid amount");
    }

    if (!["UPI", "Crypto", "Telegram"].includes(method)) {
        throw new apiError(400, "Invalid payment method");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
        throw new apiError(404, "User not found");
    }

    // Create wallet transaction
    const walletTxn = await WalletTransaction.create({
        userId: user._id,
        type: "deposit",
        amount,
        method,
        status: isPaid ? "approved" : "pending",
        adminVerified: isPaid,
        remark: isPaid ? "Payment successful" : "Awaiting payment verification",
    });

    // Update balance if payment is successful
    if (isPaid) {
        user.walletBalance += amount;
        await user.save();
    }

    return res.status(201).json(
        new apiResponse(
            201,
            {
                transaction: walletTxn,
                walletBalance: user.walletBalance,
                ...(converted && { converted }),
            },
            isPaid
                ? `✅ ₹${amount} added to wallet`
                : "✅ Transaction created, awaiting confirmation"
        )
    );
});

const requestWithdrawal = asyncHandler(async (req, res) => {
    try {
        const {
            userId,
            amount,
            method,
            status,        // optional, default is 'pending'
            adminVerified, // optional, default false
            details,       // object containing transaction-specific details
            remarks
        } = req.body;

        // 1. Validate input
        if (!amount || amount <= 0) {
            throw new apiError(400, "Invalid amount");
        }

        if (!userId || !amount || !method) {
            return res.status(400).json({ message: 'Required fields missing' });
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new apiError(404, "User not found");
        }

        if (user.walletBalance < amount) {
            throw new apiError(400, "Insufficient wallet balance");
        }

        user.walletBalance -= amount;
        user.save();

        // 3. Log WalletTransaction (status: pending)
        const newTransaction = new WalletTransaction({
            userId,
            type: "withdrawal",
            amount,
            method,
            status,         // will fallback to default if undefined
            adminVerified,  // will fallback to default if undefined
            details: details || {},
            remarks: remarks || []
        });

        const savedTransaction = await newTransaction.save();

        return res.status(201).json(
            new apiResponse(
                201,
                {
                    savedTransaction
                },
                "✅ Withdrawal request submitted. Awaiting admin approval."
            )
        );
    } catch (error) {
        console.error('Error creating wallet transaction:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

const getUserTransactionHistory = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
        WalletTransaction.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WalletTransaction.countDocuments({ userId })
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            transactions
        }, "✅ Transaction history fetched")
    );
});

const getAllUsersTransactionHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
        WalletTransaction.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WalletTransaction.countDocuments({})
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            transactions
        }, "✅ All users' transaction history fetched")
    );
});

const updateWalletTransactionStatus = async (req, res) => {
    try {
        const { status, id, userId, amount } = req.body;
        console.log(userId)

        // Validate status input if provided
        const validStatuses = ['pending', 'approved', 'rejected', 'failed', 'completed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Default values for `adminVerified` and `remark`
        const adminVerified = true; // Always set to true
        const remark = "Status updated by admin."; // Default remark

        // Prepare the update fields
        const updateFields = {
            status,
            adminVerified, // Set adminVerified to true
        };

        // Add remark to the `remarks` array
        updateFields.$push = {
            remarks: {
                message: remark,
                createdAt: new Date(),
            },
        };

        // Update the transaction
        const updatedTransaction = await WalletTransaction.findByIdAndUpdate(
            id,
            updateFields,
            { new: true }
        );

        if (status === "rejected") {
            const user = await User.findById(userId);
            user.walletBalance += amount;
            user.save();
        }

        // If transaction is not found, return an error
        if (!updatedTransaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Return the updated transaction
        res.status(200).json(updatedTransaction);

    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({ message: 'An error occurred while updating the transaction status' });
    }
};

const getAllWithdrawalsHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
        WalletTransaction.find({ type: 'withdrawal' })  // Only fetch records where type is 'withdrawal'
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WalletTransaction.countDocuments({ type: 'withdrawal' })  // Count only 'withdrawal' transactions
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            withdrawals  // Return withdrawal transactions
        }, "✅ All withdrawal history fetched")
    );
});

const getAllDepositeHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [deposit, total] = await Promise.all([
        WalletTransaction.find({ type: 'deposit' })  // Only fetch records where type is 'withdrawal'
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        WalletTransaction.countDocuments({ type: 'deposit' })  // Count only 'withdrawal' transactions
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            deposit  // Return withdrawal transactions
        }, "✅ All deposit history fetched")
    );
});

const requestDeposite = asyncHandler(async (req, res) => {
    try {
        const {
            userId,
            amount,
            method,
            status,        // optional, default is 'pending'
            adminVerified, // optional, default false
            details,       // object containing transaction-specific details
            remarks
        } = req.body;

        // 1. Validate input
        if (!amount || amount <= 0) {
            throw new apiError(400, "Invalid amount");
        }

        if (!userId || !amount || !method) {
            return res.status(400).json({ message: 'Required fields missing' });
        }

        const user = await User.findById(userId);
        if (!user) {
            throw new apiError(404, "User not found");
        }

        // 3. Log WalletTransaction (status: pending)
        const newTransaction = new WalletTransaction({
            userId,
            type: "deposit",
            amount,
            method,
            status,         // will fallback to default if undefined
            adminVerified,  // will fallback to default if undefined
            details: details || {},
            remarks: remarks || []
        });

        const savedTransaction = await newTransaction.save();

        return res.status(201).json(
            new apiResponse(
                201,
                {
                    savedTransaction
                },
                "✅ deposit request submitted. Awaiting admin approval."
            )
        );
    } catch (error) {
        console.error('Error creating wallet transaction:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

const updateDepositeTransactionStatus = async (req, res) => {
    try {
        const { status, id, userId, amount } = req.body;
        console.log(userId)

        // Validate status input if provided
        const validStatuses = ['pending', 'approved', 'rejected', 'failed', 'completed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Default values for `adminVerified` and `remark`
        const adminVerified = true; // Always set to true
        const remark = "Status updated by admin."; // Default remark

        // Prepare the update fields
        const updateFields = {
            status,
            adminVerified, // Set adminVerified to true
        };

        // Add remark to the `remarks` array
        updateFields.$push = {
            remarks: {
                message: remark,
                createdAt: new Date(),
            },
        };

        // Update the transaction
        const updatedTransaction = await WalletTransaction.findByIdAndUpdate(
            id,
            updateFields,
            { new: true }
        );

        if (status === "approved") {
            const user = await User.findById(userId);
            user.walletBalance += amount;
            user.save();
        }

        // If transaction is not found, return an error
        if (!updatedTransaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Return the updated transaction
        res.status(200).json(updatedTransaction);

    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({ message: 'An error occurred while updating the transaction status' });
    }
};

const updateTelegramDepositeTransactionStatus = async (req, res) => {
    try {
        const { status, id, userId, amount } = req.body;
        console.log(userId)

        // Validate status input if provided
        const validStatuses = ['pending', 'approved', 'rejected', 'failed', 'completed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Default values for `adminVerified` and `remark`
        const adminVerified = true; // Always set to true
        const remark = "Status updated by admin."; // Default remark

        // Prepare the update fields
        const updateFields = {
            status,
            adminVerified, // Set adminVerified to true
        };

        // Add remark to the `remarks` array
        updateFields.$push = {
            remarks: {
                message: remark,
                createdAt: new Date(),
            },
        };

        // Update the transaction
        const updatedTransaction = await WalletTransaction.findByIdAndUpdate(
            id,
            updateFields,
            { new: true }
        );

        // If transaction is not found, return an error
        if (!updatedTransaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        // Return the updated transaction
        res.status(200).json(updatedTransaction);

    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({ message: 'An error occurred while updating the transaction status' });
    }
};


export {
    addMoneyToWallet,
    requestWithdrawal,
    getUserTransactionHistory,
    updateWalletTransactionStatus,
    getAllUsersTransactionHistory,
    getAllWithdrawalsHistory,
    getAllDepositeHistory,
    requestDeposite,
    updateDepositeTransactionStatus,
    updateTelegramDepositeTransactionStatus
}