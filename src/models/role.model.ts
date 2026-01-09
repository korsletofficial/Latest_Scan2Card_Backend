import { Schema, Document, model } from "mongoose";

// Role Interface
export interface IRole extends Document {
  name: string;
  description: string;
  isActive: boolean;
  isDeleted: boolean;
}

// Role Schema
const RoleSchema = new Schema<IRole>(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true,
      minlength: [2, 'Role name must be at least 2 characters'],
      maxlength: [100, 'Role name must not exceed 100 characters'],
      trim: true
    },
    description: { 
      type: String, 
      required: true,
      minlength: [5, 'Role description must be at least 5 characters'],
      maxlength: [500, 'Role description must not exceed 500 characters'],
      trim: true
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const RoleModel = model<IRole>("Roles", RoleSchema);

export default RoleModel;
