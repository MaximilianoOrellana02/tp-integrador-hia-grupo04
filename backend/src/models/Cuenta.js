import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

export const ROLES = ["usuario", "admin"];

export class Cuenta extends Model {}

Cuenta.init(
  {
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: "El email no es válido",
        },
      },
      set(valor) {
        this.setDataValue("email", valor?.trim().toLowerCase());
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "El nombre es obligatorio",
        },
      },
    },
    // Solo se cambia con el script "hacer-admin", nunca desde la API
    rol: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "usuario",
      validate: {
        isIn: {
          args: [ROLES],
          msg: "Rol no válido",
        },
      },
    },
    ultimoAcceso: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Cuenta",
    tableName: "cuentas",
    defaultScope: {
      attributes: {
        exclude: ["passwordHash"],
      },
    },
    scopes: {
      conPassword: {},
    },
  },
);
