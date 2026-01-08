import mongoose, { Schema, Document, model, PaginateModel } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

// Team Interface
export interface ITeam extends Document {
  teamName: string;
  description?: string;
  teamManagerId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  isActive: boolean;
  isDeleted: boolean;
}

// Team Schema
const TeamSchema = new Schema<ITeam>(
  {
    teamName: { 
      type: String, 
      required: true, 
      trim: true,
      minlength: 2,
      maxlength: 150
    },
    description: { 
      type: String, 
      trim: true,
      maxlength: 1000
    },
    teamManagerId: { 
      type: Schema.Types.ObjectId, 
      ref: "Users", 
      required: true 
    },
    eventId: { 
      type: Schema.Types.ObjectId, 
      ref: "Events", 
      required: true 
    },
    members: [{ 
      type: Schema.Types.ObjectId, 
      ref: "Users"
    }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

TeamSchema.plugin(mongoosePaginate);

const TeamModel = model<ITeam, PaginateModel<ITeam>>("Teams", TeamSchema);

export default TeamModel;
