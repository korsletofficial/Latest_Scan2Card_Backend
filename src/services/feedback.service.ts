import FeedbackModel from "../models/feedback.model";

interface GetAllFeedbackFilter {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
}

// Get all feedback (Admin only)
export const getAllFeedback = async (filter: GetAllFeedbackFilter) => {
  const page = filter.page || 1;
  const limit = filter.limit || 10;

  const query: any = { isDeleted: false };
  if (filter.status) query.status = filter.status;
  if (filter.category) query.category = filter.category;

  const feedbacks = await FeedbackModel.paginate(query, {
    page,
    limit,
    sort: { createdAt: -1 },
    populate: { path: "userId", select: "firstName lastName email role companyName" },
  });

  return {
    feedbacks: feedbacks.docs,
    pagination: {
      total: feedbacks.totalDocs,
      page: feedbacks.page,
      pages: feedbacks.totalPages,
      limit: feedbacks.limit,
    },
  };
};

// Update feedback status (Admin only)
export const updateFeedbackStatus = async (id: string, status: string) => {
  if (!status || !["pending", "reviewed", "resolved"].includes(status)) {
    throw new Error("Valid status is required (pending, reviewed, resolved)");
  }

  const feedback = await FeedbackModel.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  ).populate("userId", "firstName lastName email");

  if (!feedback) {
    throw new Error("Feedback not found");
  }

  return feedback;
};

// Get feedback statistics (Admin only)
export const getFeedbackStats = async () => {
  const [total, pending, reviewed, resolved] = await Promise.all([
    FeedbackModel.countDocuments({ isDeleted: false }),
    FeedbackModel.countDocuments({ isDeleted: false, status: "pending" }),
    FeedbackModel.countDocuments({ isDeleted: false, status: "reviewed" }),
    FeedbackModel.countDocuments({ isDeleted: false, status: "resolved" }),
  ]);

  const byCategory = await FeedbackModel.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);

  return {
    total,
    pending,
    reviewed,
    resolved,
    byCategory: byCategory.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>),
  };
};

// Submit feedback
export const submitFeedback = async (
  userId: string,
  data: { message: string; rating?: number; category?: string }
) => {
  if (!data.message) {
    throw new Error("Feedback message is required");
  }

  if (data.message.length > 1000) {
    throw new Error("Feedback message cannot exceed 1000 characters");
  }

  const feedback = await FeedbackModel.create({
    userId,
    message: data.message,
    rating: data.rating || undefined,
    category: data.category || "other",
    status: "pending",
  });

  await feedback.populate("userId", "firstName lastName email");

  return feedback;
};

// Get user's feedback history
export const getUserFeedback = async (
  userId: string,
  page: number = 1,
  limit: number = 10
) => {
  const feedbacks = await FeedbackModel.paginate(
    { userId, isDeleted: false },
    {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: { path: "userId", select: "firstName lastName email" },
    }
  );

  return {
    feedbacks: feedbacks.docs,
    pagination: {
      total: feedbacks.totalDocs,
      page: feedbacks.page,
      pages: feedbacks.totalPages,
      limit: feedbacks.limit,
    },
  };
};
