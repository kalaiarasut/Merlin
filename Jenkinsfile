pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    AWS_REGION = 'ap-south-1'
    AWS_ACCOUNT_ID = '204687257890'
    ECR_REGISTRY = '204687257890.dkr.ecr.ap-south-1.amazonaws.com'
    BACKEND_REPO = 'merlin-backend'
    AI_REPO = 'merlin-ai-services'
    FRONTEND_BUCKET = 'merlin-frontend'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Set Image Tag') {
      steps {
        script {
          env.SHORT_SHA = sh(script: 'git rev-parse --short=8 HEAD', returnStdout: true).trim()
          env.SAFE_BRANCH = (env.BRANCH_NAME ?: 'main').replaceAll('[^A-Za-z0-9_.-]', '-')
          env.IMAGE_TAG = "${env.SAFE_BRANCH}-${env.SHORT_SHA}-${env.BUILD_NUMBER}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.IMAGE_TAG}"
        }
      }
    }

    stage('Login to ECR') {
      steps {
        sh '''
          aws ecr get-login-password --region ${AWS_REGION} | \
          docker login --username AWS --password-stdin ${ECR_REGISTRY}
        '''
      }
    }

    stage('Build Images') {
      parallel {
        stage('Build Backend') {
          steps {
            sh '''
              docker build -f docker/backend.Dockerfile \
                -t ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG} \
                -t ${ECR_REGISTRY}/${BACKEND_REPO}:latest \
                backend
            '''
          }
        }

        stage('Build AI Services') {
          steps {
            sh '''
              docker build -f docker/ai-services.Dockerfile \
                -t ${ECR_REGISTRY}/${AI_REPO}:${IMAGE_TAG} \
                -t ${ECR_REGISTRY}/${AI_REPO}:latest \
                ai-services
            '''
          }
        }
      }
    }

    stage('Push Images') {
      parallel {
        stage('Push Backend') {
          steps {
            sh '''
              docker push ${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}
              docker push ${ECR_REGISTRY}/${BACKEND_REPO}:latest
            '''
          }
        }

        stage('Push AI Services') {
          steps {
            sh '''
              docker push ${ECR_REGISTRY}/${AI_REPO}:${IMAGE_TAG}
              docker push ${ECR_REGISTRY}/${AI_REPO}:latest
            '''
          }
        }
      }
    }

    stage('Build Frontend') {
      steps {
        sh '''
          cd frontend
          npm ci
          npm run build
        '''
      }
    }

    stage('Deploy Frontend to S3') {
      when {
        branch 'main'
      }
      steps {
        sh '''
          aws s3 sync frontend/dist s3://${FRONTEND_BUCKET} --delete
        '''
      }
    }
  }

  post {
    success {
      echo "Backend and AI images pushed successfully: ${IMAGE_TAG} and latest"
      echo "Frontend deployed to s3://${FRONTEND_BUCKET} from frontend/dist"
    }
    failure {
      echo 'Build or push failed. Check stage logs.'
    }
    always {
      sh 'docker image prune -af || true'
    }
  }
}
