"use client"
import React, { useState, useEffect } from 'react'
import { Separator } from "@/components/ui/separator"
import { useUser } from "@clerk/clerk-react";
import axios from 'axios';
import { Button } from "@/components/ui/button";
import { Upload, X, Save } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const api = axios.create({
  baseURL: "codecollabbackend-production-e138.up.railway.app:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

export default function Page() {
  const { user } = useUser();
  const userId = user?.id;
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    profilePicture: ""
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get(`/user/${userId}`);
        setFormData(response.data);
        setPreviewImage(response.data.profilePicture);
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.error("Failed to load profile data");
        setIsLoading(false);
      }
    };
    
    if (userId) {
      fetchUser();
    }
  }, [userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file size (limit to 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
      
      setFileToUpload(file);
      
      // Create a preview
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePhoto = () => {
    setPreviewImage(null);
    setFileToUpload(null);
    setFormData(prev => ({ ...prev, profilePicture: "" }));
    toast.success("Profile picture removed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.username || !formData.firstName || !formData.lastName || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    // Start loading state
    setIsLoading(true);
    
    // Show loading toast
    const loadingToast = toast.loading("Updating your profile...");

    try {
      // Handle file upload if there's a new file
      let profilePictureUrl = formData.profilePicture;
      
      if (fileToUpload) {
        // Create form data for file upload
        const uploadData = new FormData();
        uploadData.append('file', fileToUpload);
        
        // Assuming your API has an endpoint for file uploads
        const uploadResponse = await axios.post('http://localhost:8000/api/upload', uploadData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        
        profilePictureUrl = uploadResponse.data.url;
      }

      // Update user with all form data including the new profile picture URL
      await api.put(`/user/${userId}`, {
        ...formData,
        profilePicture: profilePictureUrl
      });

      // Dismiss loading toast and show success
      toast.dismiss(loadingToast);
      toast.success("Profile updated successfully");
    } catch (error) {
      console.error("Error updating profile:", error);
      
      // Dismiss loading toast and show error
      toast.dismiss(loadingToast);
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-pulse text-neutral-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto  mt-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl text-white">Profile Settings</h1>
        <p className="text-sm text-neutral-400 mb-6">Manage your account information and preferences</p>
      </div>


      <Separator />
      
      <form onSubmit={handleSubmit} className="space-y-6 mt-10">
        <Card className="overflow-hidden border-0 bg-black/20 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="relative group">
                {previewImage ? (
                  <div className="relative">
                    <img 
                      src={previewImage} 
                      alt="Profile" 
                      className="rounded-full w-28 h-28 object-cover ring-2 ring-white/10"
                    />
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      className="absolute -top-2 -right-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="rounded-full w-28 h-28 bg-neutral-800 flex items-center justify-center text-neutral-500 ring-2 ring-white/10">
                    <Upload className="h-8 w-8 opacity-50" />
                  </div>
                )}
                
                <div className="mt-3">
                  <div className="relative">
                    <input
                      type="file"
                      id="profile-upload"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={handleFileChange}
                    />
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline" 
                      className="w-full text-xs"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Change Photo
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 space-y-4 w-full">
                <div>
                  <Label htmlFor="username" className="text-neutral-400 text-xs font-medium">
                    Username
                  </Label>
                  <Input 
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="mt-1 bg-black/30 border-neutral-800 focus-visible:ring-primary/20"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName" className="text-neutral-400 text-xs font-medium">
                      First Name
                    </Label>
                    <Input 
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="mt-1 bg-black/30 border-neutral-800 focus-visible:ring-primary/20"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="lastName" className="text-neutral-400 text-xs font-medium">
                      Last Name
                    </Label>
                    <Input 
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="mt-1 bg-black/30 border-neutral-800 focus-visible:ring-primary/20"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="email" className="text-neutral-400 text-xs font-medium">
                    Email Address
                  </Label>
                  <Input 
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="mt-1 bg-black/30 border-neutral-800 focus-visible:ring-primary/20"
                    required
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="flex justify-end gap-3">
        <Link href="/dashboard" >
          <Button 
            type="button" 
            variant="outline" 
            className="border-neutral-800 hover:bg-neutral-900 text-neutral-300"
          >
            Cancel
          </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin mr-2"></div>
                Saving
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}